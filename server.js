let express = require('express');
const { Server } = require("socket.io");

let io = null, httpServer = null, config = null, httpHandler = null, userSocketMap = new Map();
let app = express();
const db = require('./utils/db');
const accountManager = require('./account');
const { check, oneOf, query, validationResult } = require('express-validator');

const roomManager = require('./room');

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
                if (!accountManager.validate_online(req.query.username, req.query.token)) {
                    throw new Error('invalid token');
                }
                if (roomManager.check_user_in_room(req.query.username)) {
                    httpHandler.send(res, 3, "user already in another room", { room_id: req.query.room_id });
                } else if (!roomManager.check_room_exists(req.query.room_id)) {
                    httpHandler.send(res, 1, "room does not exist!", { room_id: req.query.room_id });
                } else if (roomManager.check_room_full(req.query.room_id)) {
                    httpHandler.send(res, 2, "room full!", { room_id: req.query.room_id });
                } else {
                    httpHandler.send(res, 0, "ok", { room_id: req.query.room_id });
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
                            { username: doc.username, nickname: doc.nickname, token: accountManager.online(req.query.username) });
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
                            httpHandler.send(res, 0, "ok", { token: accountManager.online(req.query.username) });
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

            let join_result = roomManager.join_room(data.username, data.room_id, socket.handshake.address);
            if (!join_result.status) {
                socket.emit('login_result', { errcode: -1, errmsg: join_result.msg });
                return;
            }

            socket.username = data.username;
            socket.token = data.token;
            socket.room_id = data.room_id;
            socket.ready = true;
            socket.score = 0;
            socket.online = true;
            socket.ip = socket.handshake.address;
            socket.seat_id = join_result.seat_id;
            socket.already_exited = false;

            userSocketMap.set(socket.username, socket);
            let other_player = roomManager.get_other_players(data.username, data.room_id);
            broadcast_information('new_player_entered_room', {
                username: data.username,
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
        });


        socket.on('disconnect', function(data) {
            // disconnect from the game server, thus exit from the room.
            let userId = socket.username;
            if (!userId || socket.already_exited === true) {
                return;
            }

            if (userSocketMap.get(userId) !== socket){
                return;
            }

            var broadcast_data = {
                username: userId,
                online: false
            };

            let other_player = roomManager.get_other_players(socket.username, socket.room_id);

            broadcast_information('player_offline', broadcast_data, other_player);

            userSocketMap.delete(userId);
            socket.username = null;
        });

        socket.on('game_ping', function(data){
            // heartbeat
            console.log('game ping msg received');
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