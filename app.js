var HALL_IP = "192.168.1.12";
var HALL_CLIENT_PORT = 9001;
var HALL_ROOM_PORT = 9002;

var ACCOUNT_PRI_KEY = "^&*#$%()@";
var ROOM_PRI_KEY = "~!@#$(*&^%$&";

var LOCAL_IP = 'localhost';

var socket_service = require("./server");
const ON_DEATH = require('death');

var hall_server_config = {
    HALL_IP:HALL_IP,
    CLEINT_PORT:HALL_CLIENT_PORT,
    FOR_ROOM_IP:LOCAL_IP,
    ROOM_PORT:HALL_ROOM_PORT,
    ACCOUNT_PRI_KEY:ACCOUNT_PRI_KEY,
    ROOM_PRI_KEY:ROOM_PRI_KEY
};

ON_DEATH(function(signal, err) {
    socket_service.close_connection();
});

socket_service.start(hall_server_config);