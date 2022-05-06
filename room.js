

function generate_room_id() {
    let roomId = 0;
    for(let i = 0; i < 5; ++i){
        roomId = roomId * 10 + Math.floor(Math.random()*10);
    }
    return roomId;
}

exports.current_num_of_rooms = 0;
exports.details = new Map();

exports.create_room = (username, rounds) => {
    // todo: check if a user created too many rooms recently
    if (exports.current_num_of_rooms >= 1000) {
        return {
            status: false,
            msg: "too many rooms!",
        }
    }

    let room_id = generate_room_id();
    while (exports.details.has(room_id)) {
        room_id = generate_room_id();
    }

    exports.details.set(room_id, {
        room_id: room_id,
        created_user: username,
        created_time: Date.now(),
        current_played_games: 0,
        num_of_players: 0,
        players: [ null, null, null ],
        total_games: rounds,
        cancel_room_deadline_if_not_start: 180,
    });

    return {
        status: true,
        msg: "ok",
        room_id: room_id,
    }
};

exports.join_room = (username, room_id) => {
    if (!exports.details.has(room_id)) {
        return {
            status: false,
            msg: "room does not exist!",
        }
    }

    let info = exports.details.get(room_id);
    if (info.num_of_players >= 3) {
        return {
            status: false,
            msg: "room full!",
        }
    }

    let i = 0;
    for (i = 0; i < 3; ++i) {
        if (info.players[i] == null) {
            break;
        }
    }
    exports.details.get(room_id).players[i] = username;
    console.log(exports.details.get(room_id));
};


