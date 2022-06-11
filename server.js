let express = require('express');
const { Server } = require("socket.io");

let io = null, httpServer = null, config = null, httpHandler = null, userSocketMap = new Map();
let app = express();
const db = require('./utils/db');
const accountManager = require('./account');
const { check, oneOf, query, validationResult } = require('express-validator');

const roomManager = require('./room');
const gameAlgorithm = require('./gameAlgorithm');
const playerActionHandler = require('./playerActionHandler');

const {get_room_info, leave_room} = require("./room");
const action_delay = 2500;
const operation_max_time = 30000;

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
    playerActionHandler.init(gameAlgorithm);

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
                if (roomManager.check_rejoin(req.query.username, room_id)) {
                    httpHandler.send(res, 0, "ok", { room_id: room_id });
                } else if (roomManager.check_user_in_room(req.query.username)) {
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
        console.log(`a user connected ${process.pid}`);
        let verify_data = (data) => {
            return data.token && data.username;
        };

        let broadcast_information = (message, data, userlists) => {
            console.log(`broadcast_information   ${process.pid}`, message, data);
            for (let i = 0; i < userlists.length; ++i) {
                if (userSocketMap.has(userlists[i].username)) {
                    userSocketMap.get(userlists[i].username).emit(message, data);
                }
            }
        };

        let clearTimer = (playerInfo) => {
            playerInfo.operation = null;
            if (playerInfo.operationTimer !== null) {
                clearTimeout(playerInfo.operationTimer);
                playerInfo.operationTimer = null;
            }
        }

        let set_guo_timer = (playerInfo, sessionKey, op_card, isDealed, op_seat_id) => {
            console.log("set_guo_timer  for  ", playerInfo.username)
            playerInfo.operation = {
                type: 'operation',
                sessionKey: sessionKey,
                op_seat_id: op_seat_id,
                opCard: op_card,
                isDealed: isDealed,
                startTime: Date.now(),
            }
            playerInfo.operationTimer = setTimeout(()=> {
                if (playerInfo.operationTimer === null) {
                    return;
                }
                broadcast_information("timer_passed", {
                    errcode: 0,
                    type: 'operation',
                    action: 'guo',
                    opCard: op_card,
                }, [playerInfo]);

                guo_handler({
                    seat_id: playerInfo.seat_id,
                    isDoneByUser: true,
                    sessionKey: sessionKey,
                }, userSocketMap.get(playerInfo.username));
            }, operation_max_time);
        };

        let set_shoot_card_timer = (playerInfo, is_last_card_dealed) => {
            playerInfo.operation = {
                type: 'shoot',
                opCard: '',
                startTime: Date.now(),
                is_last_card_dealed: is_last_card_dealed,
            };
            console.log("set_shoot_card_timer  for  ", playerInfo)
            playerInfo.operationTimer = setTimeout(()=> {
                let card = playerActionHandler.determineCardForShoot(playerInfo);
                if (card !== null) {
                    broadcast_information("timer_passed", {
                        errcode: 0,
                        type: 'shoot_card',
                        action: 'shoot',
                        opCard: card,
                    }, [playerInfo]);

                    shootCard_handler({
                        opCard: card,
                        type: 'onHand',
                    }, userSocketMap.get(playerInfo.username));
                }
            }, operation_max_time)
        }

        let process_dealed_card_ti_wei_pao = (playerInfo, ti_wei_pao_result) => {
            if (ti_wei_pao_result.from_wei_or_peng) {
                for (let cards of playerInfo.cardsAlreadyUsed) {
                    if (['wei', 'peng'].indexOf(cards.type) >= 0
                        && cards.cards[2] === ti_wei_pao_result.cards[cards.length - 1]) {
                        playerInfo.xi -= cards.xi;
                        cards.type = ti_wei_pao_result.type;
                        if (ti_wei_pao_result.type === "pao") {
                            for (let i = 0; i < 3; ++i) {
                                cards.cards[i] = ti_wei_pao_result.opCard;
                            }
                        }
                        cards.cards.push(ti_wei_pao_result.opCard);
                        cards.xi = gameAlgorithm.calculate_xi(ti_wei_pao_result.type, ti_wei_pao_result.opCard);
                        playerInfo.xi += cards.xi;
                        break;
                    }
                }
            } else {
                let xi = gameAlgorithm.calculate_xi(ti_wei_pao_result.type, ti_wei_pao_result.opCard);
                playerInfo.cardsAlreadyUsed.push({
                    type: ti_wei_pao_result.type,
                    cards: ti_wei_pao_result.cards,
                    xi: xi,
                })
                playerInfo.cardsOnHand.set(ti_wei_pao_result.opCard, 0);
                playerInfo.xi += xi;
            }
            if (['ti', 'pao'].indexOf(ti_wei_pao_result.type) >= 0) {
                playerInfo.ti_pao_counter++;
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

            socket.score = 0;
            socket.username = data.username;
            socket.nickname = nickname;
            socket.token = data.token;
            socket.room_id = parseInt(data.room_id);
            socket.ready = true;
            socket.online = true;
            socket.ip = socket.handshake.address;

            if (userSocketMap.has(data.username)) {
                let oldSocket = userSocketMap.get(data.username);
                let oldRoomId = oldSocket.room_id;
                let roomInfo = roomManager.get_room_info(oldRoomId);
                if (roomInfo !== null && roomInfo.game_state === 1 &&
                    data.room_id === oldRoomId) {
                    // relogin
                    socket.score = oldSocket.score;
                    socket.playerInfo = oldSocket.playerInfo;
                    socket.playerInfo.online = true;
                    socket.seat_id = oldSocket.seat_id;
                    socket.operationTimer = oldSocket.operationTimer;
                    roomInfo.last_join_seat_id = oldSocket.seat_id;
                    userSocketMap.set(socket.username, socket);
                    let login_result_data = {
                        errcode: 0,
                        relogin: true,
                        errmsg: "ok",
                        room_id: data.room_id,
                        seat_id: oldSocket.seat_id,
                        playersInfo: roomManager.filterImportantProperties(roomInfo.players),
                        numberOfHoleCards:
                            roomInfo.current_hole_cards.length - roomInfo.current_hole_cards_cursor,
                        cardsOnHand: Array.from(socket.playerInfo.cardsOnHand),
                        number_of_wang: roomInfo.number_of_wang,
                        current_played_games: roomInfo.current_played_games,
                        total_games: roomInfo.total_games,
                    }
                    let other_player = roomManager.get_other_players(data.username, data.room_id);
                    broadcast_information('new_player_entered_room', {
                        username: data.username,
                        nickname: nickname,
                        relogin: true,
                        seat_id: oldSocket.seat_id,
                    }, other_player);
                    socket.emit('login_result', login_result_data);
                }
                return;
            }

            let join_result = roomManager.join_room(data.username, data.room_id, socket.handshake.address, nickname);
            if (!join_result.status) {
                socket.emit('login_result', { errcode: -1, errmsg: join_result.msg });
                return;
            }
            let roomInfo = roomManager.get_room_info(socket.room_id);
            socket.seat_id = join_result.seat_id;
            roomInfo.last_join_seat_id = join_result.seat_id;

            userSocketMap.set(socket.username, socket);
            let other_player = roomManager.get_other_players(data.username, data.room_id);
            broadcast_information('new_player_entered_room', {
                username: data.username,
                nickname: nickname,
                relogin: false,
                seat_id: join_result.seat_id,
                online: true,
                ready: true,
                score: 0,
            }, other_player);

            socket.emit('login_result', {
                errcode: 0,
                relogin: false,
                errmsg: "ok",
                room_id: data.room_id,
                seat_id: join_result.seat_id,
                other_players: other_player, // todo: remove IP field for security purpose
            });

            socket.playerInfo = join_result.player_info;
        });

        socket.on('ifGameReady', (data) => {
            let roomInfo = roomManager.get_room_info(socket.room_id);
            if (gameAlgorithm.check_if_game_can_start(socket.room_id) && socket.seat_id === roomInfo.last_join_seat_id) {
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
            const loseMark = huResult.fan * huResult.tun;
            for (let i = 0; i < 3; ++i) {
                if (i === mysocket.playerInfo.seat_id) {
                    roomInfo.players[i].score += (2 * loseMark);
                } else {
                    roomInfo.players[i].score -= (loseMark);
                }
            }
            let afterScore = [roomInfo.players[0].score, roomInfo.players[1].score, roomInfo.players[2].score];
            let all_online = true;
            for (let i = 0; i < 3; ++i) {
                if (roomInfo.players[i].online !== true) {
                    all_online = false;
                }
            }
            const data = {
                errcode: 0,
                op_seat_id: mysocket.playerInfo.seat_id,
                type: 'hu',
                cardsGroups: huResult.cardsGroups,
                xi: huResult.xi,
                fan: huResult.fan,
                tun: huResult.tun,
                loseMark: huResult.fan * huResult.tun,
                afterScore: afterScore,
                nicknames: [roomInfo.players[0].nickname, roomInfo.players[1].nickname, roomInfo.players[2].nickname],
                huInfo: huResult.huInfo,
                holeCards: holeCards,
                lastGame: roomInfo.current_played_games === roomInfo.total_games || !all_online,
            };
            broadcast_information('other_player_hu', data, other_player);
            mysocket.emit('self_action_result', data);
            // roomInfo.in_game = false;
            roomInfo.number_of_wang = 0;
            if (roomInfo.current_played_games < roomInfo.total_games) {
                if (all_online) {
                    let target = [roomInfo.players[roomInfo.last_join_seat_id]];
                    setTimeout(function() {
                        broadcast_information('askGameReady', {
                            errcode: 0,
                        }, target);
                    }, 5000)
                } else {
                    roomInfo.game_state = 2;
                    for (let i = 0; i < 3; ++i) {
                        if (roomInfo.players[i].online !== true) {
                            userSocketMap.delete(roomInfo.players[i].username);
                            roomManager.leave_room(roomInfo.players[i].username, roomInfo.room_id);
                        }
                    }
                }
            }
        };

        let pengCheckout = (pengResult, other_player, mysocket) => {
            let current_xi = gameAlgorithm.calculate_xi('peng', pengResult.opCard);
            mysocket.playerInfo.xi += current_xi;
            const data = {
                errcode: 0,
                op_seat_id: mysocket.playerInfo.seat_id,
                type: 'peng',
                cards: [pengResult.opCard, pengResult.opCard, pengResult.opCard],
                from_wei_or_peng: 0,
                xi: mysocket.playerInfo.xi,
            };

            mysocket.playerInfo.cardsAlreadyUsed.push({
                type: 'peng',
                cards: [pengResult.opCard, pengResult.opCard, pengResult.opCard],
                xi: current_xi,
            })
            mysocket.playerInfo.cardsOnHand.set(pengResult.opCard, 0);
            broadcast_information('other_player_action', data, other_player);
            mysocket.emit('self_action_result', data);
        };

        let chiCheckout = (chiResult, other_player, mysocket, dealed_card) => {
            mysocket.playerInfo.cardsOnHand.set(dealed_card, mysocket.playerInfo.cardsOnHand.get(dealed_card) + 1);
            for (let cards of chiResult.manyCards) {
                let xi = gameAlgorithm.calculate_xi('chi', cards);
                mysocket.playerInfo.xi += xi;
                for (let card of cards) {
                    mysocket.playerInfo.cardsOnHand.set(card, mysocket.playerInfo.cardsOnHand.get(card) - 1);
                }
                mysocket.playerInfo.cardsAlreadyUsed.push({
                    type: 'chi',
                    cards: cards,
                    xi: xi,
                })
            }

            const data = {
                errcode: 0,
                op_seat_id: mysocket.playerInfo.seat_id,
                type: 'chi',
                opCard: dealed_card,
                manyCards: chiResult.manyCards,
                xi: mysocket.playerInfo.xi,
            };

            broadcast_information('other_player_action', data, other_player);
            mysocket.emit('self_action_result', data);
        };

        let process_to_next_instruction = (roomInfo, roomManager) => {
            roomManager.clear_session(roomInfo.current_status);
            setTimeout(() => {
                let next_instruction = roomInfo.next_instruction;
                let priority = [2, 2, 2];
                // console.log("process_to_next_instruction  ", roomInfo.next_instruction, roomInfo.current_status);
                if (next_instruction.type === 0) {
                    let target_player = roomInfo.players[next_instruction.seat_id];
                    broadcast_information('need_shoot', {
                        errcode: 0,
                        op_seat_id: next_instruction.seat_id
                    }, roomInfo.players);
                    set_shoot_card_timer(target_player, roomInfo.is_last_card_dealed);
                } else if (next_instruction.type === 1) {
                    if (roomInfo.current_hole_cards_cursor === roomInfo.current_hole_cards.length) {
                        let afterScore = [roomInfo.players[0].score, roomInfo.players[1].score, roomInfo.players[2].score];
                        let all_online = true;
                        for (let i = 0; i < 3; ++i) {
                            if (roomInfo.players[i].online !== true) {
                                all_online = false;
                            }
                        }
                        // wang hu
                        broadcast_information('wang_hu', {
                            errcode: 0,
                            op_seat_id: -1,
                            type: "wang_hu",
                            huInfo: ["亡胡"],
                            loseMark: 0,
                            cardsGroups: [],
                            holeCards: [],
                            afterScore: afterScore,
                            lastGame: roomInfo.current_played_games === roomInfo.total_games || !all_online,
                            nicknames: [roomInfo.players[0].nickname, roomInfo.players[1].nickname, roomInfo.players[2].nickname],
                        }, roomInfo.players);
                        roomInfo.number_of_wang += 1;
                        // roomInfo.in_game = false;
                        if (roomInfo.current_played_games < roomInfo.total_games) {
                            if (all_online) {
                                let target = [roomInfo.players[roomInfo.last_join_seat_id]];
                                setTimeout(function() {
                                    broadcast_information('askGameReady', {
                                        errcode: 0,
                                    }, target);
                                }, 5000)
                            } else {
                                roomInfo.game_state = 2;
                                for (let i = 0; i < 3; ++i) {
                                    if (roomInfo.players[i].online !== true) {
                                        userSocketMap.delete(roomInfo.players[i].username);
                                        roomManager.leave_room(roomInfo.players[i].username, roomInfo.room_id);
                                    }
                                }
                            }
                        }

                    } else {
                        roomInfo.is_last_card_dealed = 1;
                        let dealed_card = roomInfo.current_hole_cards[roomInfo.current_hole_cards_cursor++];
                        let result = gameAlgorithm.check_ti_wei_pao(next_instruction.seat_id, roomInfo.players, dealed_card);

                        if (result.status === true) {
                            process_dealed_card_ti_wei_pao(roomInfo.players[result.op_seat_id], result);
                            broadcast_information('dealed_card', {
                                errcode: 0,
                                dealed_card: dealed_card,
                                op_seat_id: next_instruction.seat_id,
                                ti_wei_pao_result: result,
                                xi: roomInfo.players[result.op_seat_id].xi,
                            }, roomInfo.players);
                            setTimeout(() => {
                                if ((roomInfo.players[result.op_seat_id].ti_pao_counter === 1 &&
                                    result.type !== 'wei') || (result.type === 'wei')) {
                                    roomInfo.next_instruction.seat_id = result.op_seat_id;
                                    roomInfo.next_instruction.type = 0; // need shoot
                                } else {
                                    roomInfo.next_instruction.seat_id = (result.op_seat_id + 1) % 3;
                                    roomInfo.next_instruction.type = 1; // deal a card
                                }
                                process_to_next_instruction(roomInfo, roomManager);
                            }, action_delay);
                            // priority[result.op_seat_id] = 0;
                            // roomManager.init_new_session(roomInfo.current_status, priority, 1, dealed_card, next_instruction.seat_id);
                        } else {
                            priority[next_instruction.seat_id] = 0;
                            priority[(next_instruction.seat_id + 1) % 3] = 1;
                            roomManager.init_new_session(roomInfo.current_status, priority, 3, dealed_card, next_instruction.seat_id);
                            for (let i = 0; i < 3; ++i) {
                                set_guo_timer(roomInfo.players[i], roomInfo.current_status.session_key,
                                    dealed_card, true, next_instruction.seat_id)
                            }
                            broadcast_information('dealed_card', {
                                errcode: 0,
                                dealed_card: dealed_card,
                                op_seat_id: next_instruction.seat_id,
                                ti_wei_pao_result: result,
                                sessionKey: roomInfo.current_status.session_key,
                            }, roomInfo.players);
                        }
                    }
                }

                next_instruction.type = 1;
                next_instruction.seat_id = (next_instruction.seat_id + 1) % 3;
            }, action_delay);
        };

        let sessionCheckout = (roomManager, roomInfo) => {
            let highestPriorityPlayerId = roomManager.selectHighestPriorityWithoutGuo(roomInfo.current_status);
            console.log('sessionCheckout  ', roomInfo.current_status, highestPriorityPlayerId)
            if (highestPriorityPlayerId === null) {
                if (roomInfo.current_status.op_card !== '') {
                    // send discarded dealed card
                    let players = roomInfo.players;
                    broadcast_information('discarded_dealed_card', {
                        errcode: 0,
                        opCard: roomInfo.current_status.op_card,
                        op_seat_id: roomInfo.current_status.dealed_seat_id,
                    }, players);
                    players[roomInfo.current_status.dealed_seat_id].cardsDiscarded.push(roomInfo.current_status.op_card);

                }
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
                roomInfo.next_instruction.seat_id = roomInfo.players[highestPriorityPlayerId].seat_id;
                roomInfo.next_instruction.type = 0; // need shoot
                process_to_next_instruction(roomInfo, roomManager);
            } else if (roomInfo.current_status.respondedUser[highestPriorityPlayerId].type === 'chi') {
                chiCheckout(
                    roomInfo.current_status.respondedUser[highestPriorityPlayerId].data,
                    other_player,
                    userSocketMap.get(roomInfo.players[highestPriorityPlayerId].username),
                    roomInfo.current_status.op_card,
                )
                roomInfo.next_instruction.seat_id = roomInfo.players[highestPriorityPlayerId].seat_id;
                roomInfo.next_instruction.type = 0; // need shoot
                process_to_next_instruction(roomInfo, roomManager);
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
            console.log('ti received  ', data);
            // TODO: check ti valid
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);
            let cards = ['back', 'back', 'back', data.opCard];
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
                needsHide: data.needsHide,
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
        });

        socket.on('hu', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId) {
                return;
            }

            clearTimer(socket.playerInfo);
            let roomInfo = roomManager.get_room_info(socket.room_id);
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);

            // TODO: validate the hu result on server side
            if (roomInfo.current_status.numOfRequiredResponse === 0) {
                huCheckout(data, other_player, socket, roomInfo);
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

            // TODO: check pao valid
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
                    for (let i = 0; i < 4; ++i) {
                        usedCards.cards[i] = data.cards;
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
            clearTimer(socket.playerInfo);
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

        socket.on('chi', (data) => {
            data = JSON.parse(data);
            let userId = socket.username;
            if (!userId) {
                return;
            }

            // TODO: check chi valid
            clearTimer(socket.playerInfo);
            let roomInfo = roomManager.get_room_info(socket.room_id);
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);
            if (roomInfo.current_status.numOfRequiredResponse === 0) {
                chiCheckout(data, other_player, socket);
            } else {
                roomInfo.current_status.respondedNums += 1;
                roomInfo.current_status.respondedUser[socket.seat_id] = {
                    type: 'chi',
                    data: data,
                };
                if (roomInfo.current_status.respondedNums === roomInfo.current_status.numOfRequiredResponse) {
                    sessionCheckout(roomManager, roomInfo);
                }
            }
        });

        let guo_handler = (data, socket) => {
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            let userId = socket.username;
            if (!userId) {
                return;
            }

            clearTimer(socket.playerInfo);
            let roomInfo = roomManager.get_room_info(socket.room_id);
            if (roomInfo.current_status.dealed_seat_id !== -1 && data.isDoneByUser === true) {
                socket.playerInfo.cardsChooseToNotUsed.push(roomInfo.current_status.op_card);
            }
            if (roomInfo.current_status.numOfRequiredResponse === 0) {
                process_to_next_instruction(roomInfo, roomManager);
            } else {
                if (roomInfo.current_status.respondedUser[socket.seat_id] !== null) {
                    return;
                }
                roomInfo.current_status.respondedNums += 1;
                roomInfo.current_status.respondedUser[socket.seat_id] = {
                    type: 'guo',
                    data: data,
                };
                if (roomInfo.current_status.respondedNums === roomInfo.current_status.numOfRequiredResponse) {
                    sessionCheckout(roomManager, roomInfo);
                }
            }
        };

        socket.on('guo', (data) => {
            guo_handler(data, socket);
        });

        let shootCard_handler = (data, socket) => {
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            let userId = socket.username;
            if (!userId || (data.type !== 'onHand' && data.type !== 'onDeal') || !gameAlgorithm.check_card_valid(data.opCard)) {
                return;
            }

            socket.playerInfo.cardsOnHand.set(data.opCard, socket.playerInfo.cardsOnHand.get(data.opCard) - 1);
            clearTimer(socket.playerInfo);
            socket.playerInfo.cardsChooseToNotUsed.push(data.opCard);

            let roomInfo = roomManager.get_room_info(socket.room_id);
            roomInfo.is_last_card_dealed = 2;
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);
            let pao_result = null;
            for (let player of other_player) {
                for (let usedCards of player.cardsAlreadyUsed) {
                    if (usedCards.type === 'wei' && usedCards.cards[2] === data.opCard) {
                        usedCards.type = "pao";
                        usedCards.cards = [data.opCard, data.opCard, data.opCard, data.opCard];
                        player.xi -= usedCards.xi;
                        usedCards.xi = gameAlgorithm.calculate_xi("pao", data.opCard);
                        player.xi += usedCards.xi;
                        player.ti_pao_counter++;
                        pao_result = {
                            op_seat_id: player.seat_id,
                            opCard: data.opCard,
                            type: 'pao',
                            cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                            from_wei: 1,
                            xi: usedCards.xi,
                        }
                        break;
                    }
                }
                if (player.cardsOnHand.get(data.opCard) === 3) {
                    let xi = gameAlgorithm.calculate_xi('pao', data.opCard);
                    player.cardsOnHand.set(data.opCard, 0);
                    player.cardsAlreadyUsed.push({
                        type: 'pao',
                        cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                        xi: xi,
                    })
                    player.xi += xi;
                    player.ti_pao_counter++;
                    pao_result = {
                        op_seat_id: player.seat_id,
                        opCard: data.opCard,
                        type: 'pao',
                        cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                        from_wei: 0,
                        xi: xi,
                    }
                    break;
                }
            }

            if (pao_result === null) {
                let priority = [0, 0, 0];
                priority[socket.seat_id] = 2;
                roomManager.init_new_session(roomInfo.current_status, priority, 2, data.opCard, socket.playerInfo.seat_id);
                for (let i = 0; i < 3; ++i) {
                    if (i !== socket.seat_id) {
                        set_guo_timer(roomInfo.players[i], roomInfo.current_status.session_key,
                            data.opCard, false, socket.playerInfo.seat_id);
                    }
                }
                broadcast_information('other_player_shoot', {
                    errcode: 0,
                    op_seat_id: socket.playerInfo.seat_id,
                    type: data.type,
                    opCard: data.opCard,
                    sessionKey: roomInfo.current_status.session_key,
                }, other_player);
            } else {
                broadcast_information('other_player_shoot', {
                    errcode: 0,
                    op_seat_id: socket.playerInfo.seat_id,
                    type: data.type,
                    opCard: data.opCard,
                    paoResult: pao_result,
                }, other_player);

                socket.emit("other_player_action", {
                    errcode: 0,
                    op_seat_id: pao_result.op_seat_id,
                    type: 'pao',
                    cards: [data.opCard, data.opCard, data.opCard, data.opCard],
                    opCard: data.opCard,
                    from_wei_or_peng: pao_result.from_wei,
                    xi: roomInfo.players[pao_result.op_seat_id].xi,
                });

                setTimeout(() => {
                    if (roomInfo.players[pao_result.op_seat_id].ti_pao_counter === 1) {
                        roomInfo.next_instruction.seat_id = pao_result.op_seat_id;
                        roomInfo.next_instruction.type = 0; // need shoot
                    } else {
                        roomInfo.next_instruction.seat_id = (pao_result.op_seat_id + 1) % 3;
                        roomInfo.next_instruction.type = 1; // deal a card
                    }
                    process_to_next_instruction(roomInfo, roomManager);
                }, action_delay);
            }

            roomInfo.at_the_beginning = false;
        };
        socket.on('shootCard', (data) => {
            shootCard_handler(data, socket);
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
            let roomInfo = roomManager.get_room_info(socket.room_id);
            let broadcast_data = {
                username: userId,
                seat_id: socket.seat_id,
                online: false,
                completely_left: true,
            };
            let other_player = roomManager.get_other_players(socket.username, socket.room_id);

            if (roomInfo.game_state === 1) {
                broadcast_data.completely_left = false;
                roomInfo.players[socket.seat_id].online = false;
                let cnt = 0;
                for (let player of other_player) {
                    if (player.online === false) {
                        ++cnt;
                    }
                }
                if (cnt === 2) {
                    for (let i = 0; i < 3; ++i) {
                        userSocketMap.delete(roomInfo.players[i].username);
                        roomManager.leave_room(roomInfo.players[i].username, socket.room_id);
                    }
                }
            } else {
                clearTimer(socket.playerInfo);
                roomManager.leave_room(socket.username, socket.room_id);
                userSocketMap.delete(userId);
            }
            broadcast_information('other_player_exit', broadcast_data, other_player);
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
    db.mongo_client.close().then(() => {
        console.log("Close connections!");
        process.exit();
    });
};