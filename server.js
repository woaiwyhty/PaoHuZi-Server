let express = require('express');
const { Server } = require("socket.io");

let io = null, httpServer = null, config = null, httpHandler = null;
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

    io = new Server(httpServer);

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
                if (accountManager.is_user_already_in_room(req.query.username)) {
                    throw new Error('already in another room');
                }
                let result = roomManager.create_room(req.query.username, req.query.num_of_games);
                if (result.status === true) {
                    roomManager.join_room(req.query.username, result.room_id);
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
                if (accountManager.is_user_already_in_room(req.query.username)) {
                    throw new Error('already in another room');
                }
                let result = roomManager.join_room(req.query.username, parseInt(req.query.room_id));
                if (result.status === true) {
                    accountManager.join_room(req.query.username, req.query.room_id);
                    httpHandler.send(res, 0, "ok", {});
                } else {
                    httpHandler.send(res, result.errcode, result.msg, {});
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

    app.listen(config.CLEINT_PORT, config.HALL_IP);
};

exports.close_connection = function() {
    db.mongo_db.close();
    console.log("Close connections!");
};