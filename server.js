let express = require('express');
const { Server } = require("socket.io");

let io = null, httpServer = null, config = null, httpHandler = null, userSocketMap = new Map();
let app = express();
const db = require('./utils/db');
const accountManager = require('./account');
const { check, oneOf, query, validationResult } = require('express-validator');

const roomManager = require('./room');
const gameAlgorithm = require('./gameAlgorithm');
const {get_room_info} = require("./room");
const action_delay = 2500;

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    res.header("X-Powered-By",' 3.2.1');
    res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

exports.start = function(conf, mgr){
    config = conf;

    httpServer = require('http').createServer(app);
    httpHandler = require('./utils/httputil');
    io = require('socket.io')(httpServer);
    gameAlgorithm.init_room_manager(roomManager);

    httpServer.listen(config.CLEINT_PORT, config.HALL_IP, () => {
        console.log("listen on ", config.HALL_IP, config.CLEINT_PORT);
    });

    app.get('/isServerOn', function(req, res){
        console.log(req.query);
        httpHandler.send(res, 0, "ok", {});
    });

    app.get('/createRoom',
        [
            query('username').exists(),
            query('username').isLength({ min: 6, max: 20 }),
            query('token').exists(),
            query('token').isLength({ min: 15, max: 30 }),
            query('num_of_games').exists(),
            query('num_of_games').isInt({ min: 6, max: 12 }),
        ],
        function(req, res){
            try {
                validationResult(req).throw();
                if (!accountManager.validate_online(req.query.username, req.query.token)) {
                    throw new Error('invalid token');
                }

                let result = roomManager.create_room(req.query.username, req.query.num_of_games);
                if (result.status === true) {
                    console.log("successfully created room, ", result.room_id);

                    httpHandler.send(res, 0, "ok", { room_id: result.room_id });
                } else {
                    httpHandler.send(res, -1, result.msg, {});
                }

            } catch (error) {
                console.log(error);
                httpHandler.send(res, -1, error.message, {});
            }
    }
    );

    app.get('/joinRoom',
        [
            query('username').exists(),
            query('username').isLength({ min: 6, max: 20 }),
            query('token').exists(),
            query('token').isLength({ min: 15, max: 30 }),
            query('room_id').exists(),
            query('room_id').isInt({ min: 10000, max: 99999 }),
        ],
        function(req, res){
            try {
                validationResult(req).throw();
                let room_id = parseInt(req.query.room_id);
                if (!accountManager.validate_online(req.query.username, req.query.token)) {
                    throw new Error('invalid token');
                }
                if (roomManager.check_user_in_room(req.query.username)) {
                    httpHandler.send(res, 3, "user already in another room", { room_id: room_id });
                } else if (!roomManager.check_room_exists(room_id)) {
                    httpHandler.send(res, 1, "room does not exist!", { room_id: room_id });
                } else if (roomManager.check_room_full(room_id)) {
                    httpHandler.send(res, 2, "room full!", { room_id: room_id });
                } else {
                    httpHandler.send(res, 0, "ok", { room_id: room_id });
                }
            } catch (error) {
                console.log(error);
                httpHandler.send(res, -1, error.message, {});
            }
        }
    );

    app.get('/guestLogin',
        [query('username').exists(), query('username').isLength({ min: 6, max: 20 })],
        function(req, res) {
            try {
                validationResult(req).throw();
                accountManager.verify_guest(db.account_collection, req.query.username, (err, doc) => {
                    if (err) throw err;
                    if (doc == null) {
                        httpHandler.send(res, 1, "need nickname", {});
                    } else {
                        httpHandler.send(res, 0, "ok",
                            { username: doc.username, nickname: doc.nickname, token: accountManager.online(req.query.username, doc.nickname) });
                    }
                });
            } catch (err) {
                console.log(err);
                httpHandler.send(res, -1, "failed", {});
            }
    });

    app.get('/guestSignup',
        [
            query('username').exists(),
            query('username').isLength({ min: 6, max: 20 }),
            query('nickname').exists(),
            query('nickname').isLength({ min: 2, max: 8 }),
        ],
        function(req, res) {
            try {
                validationResult(req).throw();
                accountManager.verify_guest(db.account_collection, req.query.username, (err, doc) => {
                    if (err) throw err;
                    if (doc == null) {
                        accountManager.new_guest(db.account_collection, req.query.username, req.query.nickname, (err, doc) => {
                            if (err) throw err;
                            httpHandler.send(res, 0, "ok", { token: accountManager.online(req.query.username, req.query.nickname) });
                        });

                    } else {
                        httpHandler.send(res, 1, "username exists", {});
                    }
                });
            } catch (err) {
                console.log(err);
                httpHandler.send(res, -1, "failed", {});
            }
        });

    io.on('connection', (socket) => {
        console.log('a user connected');
        let verify_data = (data) => {
            return data.token && data.username;
        };

        let broadcast_information = (message, data, userlists) => {
            console.log('broadcast_information   ', message, data);
            for (let i = 0; i < userlists.length; ++i) {
                if (userSocketMap.has(userlists[i].username)) {
                    userSocketMap.get(userlists[i].username).emit(message, data);
                }
            }
        };

        socket.on('login', (data) => {
            console.log("a user trys to login  ", data);
            data = JSON.parse(data);
            // login and join the room
            if (!verify_data(data)) {
                socket.emit('login_result', { errcode: -1, errmsg: "invalid token" });
                return;
            }
            if (!data.room_id) {
                socket.emit('login_result', { errcode: -1, errmsg: "invalid room id" });
                return;
            }
            if (!accountManager.validate_online(data.username, data.token)) {
                socket.emit('login_result', { errcode: -1, errmsg: "user not online" });
                return;
            }

            let nickname = accountManager.get_nick_name(data.username);
            let join_result = roomManager.join_room(data.username, data.room_id, socket.handshake.address, nickname);
            if (!join_result.status) {
                socket.emit('login_result', { errcode: -1, errmsg: join_result.msg });
                return;
            }

            socket.username = data.username;
            socket.nickname = nickname;
            socket.token = data.token;
            socket.room_id = parseInt(data.room_id);
            socket.ready = true;
            socket.score = 0;
            socket.online = true;
            socket.ip = socket.handshake.address;
            socket.seat_id = join_result.seat_id;
            socket.already_exited = false;
            socket.room_info = roomManager.get_room_info(data.room_id);

            userSocketMap.set(socket.username, socket);
            let other_player = roomManager.get_other_players(data.username, data.room_id);
            broadcast_information('new_player_entered_room', {
                username: data.username,
                nickname: nickname,
                seat_id: join_result.seat_id,
                online: true,
                ready: true,
                score: 0,
            }, other_player);

            socket.emit('login_result', {
                errcode: 0,
                errmsg: "ok",
                room_id: data.room_id,
                seat_id: join_result.seat_id,
                other_players: other_player, // todo: remove IP field for security purpose
            });

            socket.playerInfo = join_result.player_info;
        });

        socket.on('ifGameReady', (data) => {
            if (gameAlgorithm.check_if_game_can_start(socket.room_id)) {
                gameAlgorithm.init_game(socket.room_id)
                // console.log(socket.playerInfo);
                let roomInfo = roomManager.get_room_info(socket.room_id);
                let tianhuResult = gameAlgorithm.checkHu([], roomInfo.players[0].cardsOnHand, null);
                for (let player of roomInfo.players) {
                    let data_to_sent = {
                        errcode: 0,
                        number_of_wang: roomInfo.number_of_wang,
                        current_played_games: roomInfo.current_played_games,
                        total_games: roomInfo.total_games,
                        tianHuResult: tianhuResult,
                        cardsOnHand: Array.from(player.cardsOnHand),
                    };
                    userSocketMap.get(player.username).emit('game_start', data_to_sent);
                }
                roomInfo.at_the_beginning = true;
            }
        });

        let huCheckout = (huResult, other_player, mysocket, roomInfo) => {
            const holeCards = roomInfo.current_hole_cards.slice(roomInfo.current_hole_cards_cursor)
            const data = {
                errcode: 0,
                op_seat_id: mysocket.playerInfo.seat_id,
                type: 'hu',
                cardsGroups: huResult.cardsGroups,
                xi: huResult.xi,
                fan: huResult.fan,
                tun: huResult.tun,
                huInfo: huResult.huInfo,
                holeCards: holeCards,
            };
            broadcast_information('other_player_hu', data, other_player);
            mysocket.emit('self_action_result', data);
        };

        let pengCheckout = (pengResult, other_player, mysocket) => {
            mysocket.playerInfo.xi += gameAlgorithm.calculate_xi('peng', pengResult.opCard);
            const data = {
                errcode: 0,
                op_seat_id: socket.playerInfo.seat_id,
                type: 'peng',
                cards: [pengResult.opCard, pengResult.opCard, pengResult.opCard],
                from_wei_or_peng: 0,
                xi: mysocket.playerInfo.xi,
            };
            broadcast_information('other_player_action', data, other_player);
            mysocket.emit('self_action_result', data);
        };

        let process_to_next_instruction = (roomInfo, roomManager) => {
            setTimeout(() => {
                let next_instruction = roomInfo.next_instruction;
                let priority = [2, 2, 2];
                console.log("process_to_next_instruction  ", roomInfo.next_instruction, roomInfo.current_status);
                if (next_instruction.type === 0) {
                    broadcast_information('need_shoot', {
                        errcode: 0,
                        op_seat_id: next_instruction.seat_id
                    }, roomInfo.players);
                } else if (next_instruction.type === 1) {
                    if (roomInfo.current_hole_cards_cursor === roomInfo.current_hole_cards.length) {
                        // wang hu
                        broadcast_information('wang_hu', {
                            errcode: 0,
                        }, roomInfo.players);
                        roomInfo.number_of_wang += 1;
                    } else {
                        let dealed_card = roomInfo.current_hole_cards[roomInfo.current_hole_cards_cursor++];
                        let result = gameAlgorithm.check_ti_wei_pao(next_instruction.seat_id, roomInfo.players, dealed_card);

                        if (result.status === true) {
                            priority[result.op_seat_id] = 0;
                            roomManager.init_new_session(roomInfo.current_status, priority, 1);
                        } else {
                            priority[next_instruction.seat_id] = 0;
                            priority[(next_instruction.seat_id + 1) % 3] = 1;
                            roomManager.init_new_session(roomInfo.current_status, [], 3);
                        }
                        broadcast_information('dealed_card', {
                            errcode: 0,
                            dealed_card: dealed_card,
                            op_seat_id: next_instruction.seat_id,
                            ti_wei_pao_result: result,
                            session_key: roomInfo.current_status.session_key,
                        }, roomInfo.players);
                    }
                }

                next_instruction.type = 1;
                next_instruction.seat_id = (next_instruction.seat_id + 1) % 3;
            }, action_delay);
        };

        let sessionCheckout = (roomManager, roomInfo) => {
            let highestPriorityPlayerId = roomManager.selectHighestPriorityWithoutGuo(roomInfo.current_status);
            if (!highestPriorityPlayerId) {
                process_to_next_instruction(roomInfo, roomManager);
                return;
            }
            let other_player = roomManager.get_other_players(roomInfo.players[highestPriorityPlayerId].username, socket.room_id);
            if (roomInfo.current_status.respondedUser[highestPriorityPlayerId].type === 'hu') {
                huCheckout(
                    roomInfo.current_status.respondedUser[highestPriorityPlayerId].data,
                    other_player,
                    userSocketMap.get(roomInfo.players[highestPriorityPlayerId].username),
                    roomInfo,
                );
            } else if (roomInfo.current_status.respondedUser[highestPriorityPlayerId].type === 'peng') {
                pengCheckout(
                    roomInfo.current_status.respondedUser[highestPriorityPlayerId].data,
                    other_player,
                    userSocketMap.get(roomInfo.players[highestPriorityPlayerId].username),
                )
            }
        };

        socket.on('tianhu_result', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId) {
                return;
            }
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);
            let roomInfo = roomManager.get_room_info(socket.room_id);

            if (data.status === true) {
                // checkout
                huCheckout(data, other_player, socket, roomInfo);
            } else {
                roomManager.init_new_session(roomInfo.current_status, [2, 0, 1], 2);
                broadcast_information('check_dihu', {
                    errcode: 0,
                    card21st: roomInfo.players[0].card21st,
                    sessionKey: roomInfo.current_status.session_key,
                }, other_player);
            }
        });

        socket.on('ti', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }
            if (gameAlgorithm.check_ti_valid(socket.playerInfo.cardsOnHand, data.opCard)) {
                let other_player = roomManager.get_other_players(socket.username, socket.room_id);
                let cards = ['back', 'back', 'back', 'back'];
                if (data.needsHide === false) {
                    cards = ['back', 'back', 'back', data.opCard];
                }
                if (data.from_wei_or_peng > 0) {
                    for (let usedCards of socket.playerInfo.cardsAlreadyUsed) {
                        if (usedCards.type === 'wei' && usedCards.cards[2] === data.opCard) {
                            usedCards.type = 'ti';
                            usedCards.xi += 6;
                            usedCards.cards = cards;
                            socket.playerInfo.xi += 6;
                        }
                    }
                } else {
                    let xi = gameAlgorithm.calculate_xi('ti', data.opCard);
                    socket.playerInfo.cardsAlreadyUsed.push({
                        type: 'ti',
                        cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                        xi: xi,
                    })
                    socket.playerInfo.xi += xi;
                    socket.playerInfo.cardsOnHand.set(data.opCard, 0);
                }
                socket.playerInfo.ti_pao_counter++;
                broadcast_information('other_player_action', {
                    errcode: 0,
                    op_seat_id: socket.playerInfo.seat_id,
                    type: 'ti',
                    cards: cards,
                    from_wei_or_peng: data.from_wei_or_peng,
                    xi: socket.playerInfo.xi,
                }, other_player);

                let roomInfo = roomManager.get_room_info(socket.room_id);
                if (!roomInfo.at_the_beginning) {
                    setTimeout(() => {
                        if (socket.playerInfo.ti_pao_counter === 1) {
                            roomInfo.next_instruction.seat_id = socket.seat_id;
                            roomInfo.next_instruction.type = 0; // need shoot
                        } else {
                            roomInfo.next_instruction.seat_id = (socket.seat_id + 1) % 3;
                            roomInfo.next_instruction.type = 1; // deal a card
                        }
                        process_to_next_instruction(roomInfo, roomManager);
                    }, action_delay);
                }
            }
        });

        socket.on('hu', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId) {
                return;
            }

            let roomInfo = roomManager.get_room_info(socket.room_id);
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);

            // TODO: validate the hu result on server side
            if (roomInfo.current_status.numOfRequiredResponse === 0) {
                huCheckout(data, other_player, socket);
            } else {
                roomInfo.current_status.respondedNums += 1;
                roomInfo.current_status.respondedUser[data.seat_id] = {
                    type: 'hu',
                    data: data,
                };
                if (roomInfo.current_status.respondedNums === roomInfo.current_status.numOfRequiredResponse) {
                    sessionCheckout(roomManager, roomInfo);
                }
            }
        });

        socket.on('pao', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }

            if (gameAlgorithm.check_pao_valid(socket.playerInfo.cardsOnHand, data.opCard)) {
                let other_player = roomManager.get_other_players(socket.username, socket.room_id);
                let newXi = gameAlgorithm.calculate_xi('pao', data.opCard);
                if (data.from_wei_or_peng > 0) {
                    for (let usedCards of socket.playerInfo.cardsAlreadyUsed) {
                        if (['wei', 'peng'].indexOf(usedCards.type)
                            && usedCards.cards[2] === data.opCard) {
                            usedCards.type = 'pao';
                            usedCards.cards = data.cards;
                            socket.playerInfo.xi += (newXi - usedCards.xi);
                            usedCards.xi = newXi;
                        }
                    }
                } else {
                    socket.playerInfo.cardsAlreadyUsed.push({
                        type: 'pao',
                        cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                        xi: newXi,
                    })
                    socket.playerInfo.xi += newXi;
                    socket.playerInfo.cardsOnHand.set(data.opCard, 0);
                }

                socket.playerInfo.ti_pao_counter++;
                broadcast_information('other_player_action', {
                    errcode: 0,
                    op_seat_id: socket.playerInfo.seat_id,
                    type: 'pao',
                    cards: data.cards,
                    from_wei_or_peng: data.from_wei_or_peng,
                    xi: socket.playerInfo.xi,
                }, other_player);

                let roomInfo = roomManager.get_room_info(socket.room_id);
                setTimeout(() => {
                    if (socket.playerInfo.ti_pao_counter === 1) {
                        roomInfo.next_instruction.seat_id = socket.seat_id;
                        roomInfo.next_instruction.type = 0; // need shoot
                    } else {
                        roomInfo.next_instruction.seat_id = (socket.seat_id + 1) % 3;
                        roomInfo.next_instruction.type = 1; // deal a card
                    }
                    process_to_next_instruction(roomInfo, roomManager);
                }, action_delay);
            }
        });

        socket.on('wei', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }

            if (gameAlgorithm.check_wei_valid(socket.playerInfo.cardsOnHand, data.opCard)) {
                let other_player = roomManager.get_other_players(socket.username, socket.room_id);
                let newXi = gameAlgorithm.calculate_xi('wei', data.opCard);
                socket.playerInfo.cardsAlreadyUsed.push({
                    type: 'wei',
                    cards: [data.opCard, data.opCard, data.opCard],
                    xi: newXi,
                })
                socket.playerInfo.xi += newXi;
                socket.playerInfo.cardsOnHand.set(data.opCard, 0);

                broadcast_information('other_player_action', {
                    errcode: 0,
                    op_seat_id: socket.playerInfo.seat_id,
                    type: 'wei',
                    cards: data.cards,
                    from_wei_or_peng: 0,
                    xi: socket.playerInfo.xi,
                }, other_player);

                let roomInfo = roomManager.get_room_info(socket.room_id);
                setTimeout(() => {
                    roomInfo.next_instruction.seat_id = socket.seat_id;
                    roomInfo.next_instruction.type = 0; // need shoot
                    process_to_next_instruction(roomInfo, roomManager);
                }, action_delay);
            }
        });

        socket.on('peng', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }
            if (gameAlgorithm.checkPeng(data.opCard, socket.playerInfo.cardsOnHand)) {
                let roomInfo = roomManager.get_room_info(socket.room_id);
                let other_player = roomManager.get_other_players(socket.username, socket.room_id);
                if (roomInfo.current_status.numOfRequiredResponse === 0) {
                    pengCheckout(data, other_player, socket);
                } else {
                    roomInfo.current_status.respondedNums += 1;
                    roomInfo.current_status.respondedUser[data.seat_id] = {
                        type: 'peng',
                        data: data,
                    };
                    if (roomInfo.current_status.respondedNums === roomInfo.current_status.numOfRequiredResponse) {
                        sessionCheckout(roomManager, roomInfo);
                    }
                }
            }
        });

        socket.on('guo', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId) {
                return;
            }

            let roomInfo = roomManager.get_room_info(socket.room_id);
            if (roomInfo.current_status.numOfRequiredResponse === 0) {
                process_to_next_instruction(roomInfo);
            } else {
                roomInfo.current_status.respondedNums += 1;
                roomInfo.current_status.respondedUser[socket.seat_id] = {
                    type: 'guo',
                    data: data,
                };
                if (roomInfo.current_status.respondedNums === roomInfo.current_status.numOfRequiredResponse) {
                    sessionCheckout(roomManager, roomInfo);
                }
            }
        });

        socket.on('shootCard', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId || (data.type !== 'onHand' && data.type !== 'onDeal') || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }
            let roomInfo = roomManager.get_room_info(socket.room_id);
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);
            let priority = [0, 0, 0];
            priority[socket.seat_id] = 2;
            roomManager.init_new_session(roomInfo.current_status, priority, 2);
            broadcast_information('other_player_shoot', {
                errcode: 0,
                op_seat_id: socket.playerInfo.seat_id,
                type: data.type,
                opCard: data.opCard,
                sessionKey: roomInfo.current_status.session_key,
            }, other_player);
            roomInfo.at_the_beginning = false;
        });

        socket.on('cardsOnHand', (data) => {
            let userId = socket.username;
            if (!userId) {
                socket.emit('cardsOnHand_result', {errcode: -1});
                return;
            }

            socket.emit('cardsOnHand_result', {
                errcode: 0,
                cardsOnHand: Array.from(socket.playerInfo.cardsOnHand),
                card21st: socket.playerInfo.card21st,
                sessionKey: roomManager.get_room_info(socket.room_id).current_status.session_key,
            });
        })

        socket.on('exit', function(data) {
            let userId = socket.username;
            if (!userId) {
                socket.emit('exit_result', { errcode: -1 });
                return;
            }

            socket.already_exited = true;
            socket.emit('exit_result', { errcode: 0 });
        });

        socket.on('disconnect', function(data) {
            // todo: support relogin after accidentally offline
            // disconnect from the game server, thus exit from the room.
            let userId = socket.username;
            if (!userId) {
                return;
            }

            if (userSocketMap.get(userId) !== socket){
                return;
            }

            var broadcast_data = {
                username: userId,
                seat_id: socket.seat_id,
                online: false,
                already_exited: socket.already_exited,
            };

            let other_player = roomManager.get_other_players(socket.username, socket.room_id);

            broadcast_information('other_player_exit', broadcast_data, other_player);
            roomManager.leave_room(socket.username, socket.room_id);
            userSocketMap.delete(userId);
            socket.username = null;
        });

        socket.on('game_ping', function(data){
            // heartbeat
            // console.log('game ping msg received');
            let userId = socket.username;
            if (!userId){
                return;
            }
            socket.emit('game_pong');
        });
    });
};

exports.close_connection = function() {
    db.mongo_db.close();
    console.log("Close connections!");
};