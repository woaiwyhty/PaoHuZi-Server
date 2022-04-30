var express = require('express');
var io = null, httpServer = null, config = null, httpHandler = null;
var app = express();

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

    app.get('/isServerOn', function(req,res){

        console.log(req.query);
        httpHandler.send(res, 0, "ok", {});
    });

    app.listen(config.CLEINT_PORT, config.HALL_IP);
};