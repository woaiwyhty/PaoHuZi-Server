

function generate_room_id() {
    let roomId = 0;
    for(let i = 0; i < 5; ++i) {
        let x = Math.floor(Math.random()*10);
        if (x === 0 && i === 0) {
            x = 5;
        }
        roomId = roomId * 10 + x;
    }
    return roomId;
}

exports.current_num_of_rooms = 0;
exports.details = new Map();
let user_room_map = new Map();

exports.get_room_info = (room_id) => {
    return exports.details.get(room_id);
};

exports.create_room = (username, rounds) => {
    // todo: check if a user created too many rooms recently
    if (exports.current_num_of_rooms >= 1000) {
        return {
            status: false,
            msg: "too many rooms!",
        }
    }

    if (user_room_map.has(username)) {
        return {
            status: false,
            errcode: 3,
            msg: "already in another room",
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
        current_status: {
            session_key: 0,
            priority: [2, 2, 2],
            respondedUser: [null, null, null],
            respondedNums: 0,
            numOfRequiredResponse: 0,
        },
        next_instruction: {
            seat_id: 0,
            type: 0, // 0: shoot card, 1: deal card
        },
        players: [ null, null, null ],
        current_hole_cards: [],
        total_games: rounds,
        number_of_wang: 0,
        cancel_room_deadline_if_not_start: 180,
        current_on_turn_player_id: 0,
    });

    exports.current_num_of_rooms += 1;
    return {
        status: true,
        msg: "ok",
        room_id: room_id,
    }
};

exports.init_new_session = (current_status, priority, numOfRequiredResponse) => {
    current_status.session_key += 1;
    current_status.priority = priority;
    current_status.respondedUser = [null, null, null];
    current_status.respondedNums = 0;
    current_status.numOfRequiredResponse = numOfRequiredResponse;
};

exports.check_room_exists = (room_id) => {
    return exports.details.has(room_id);
};

exports.check_user_in_room = (username) => {
    return user_room_map.has(username);
};

exports.check_room_full = (room_id) => {
    return exports.details.get(room_id).num_of_players >= 3;
};

exports.join_room = (username, room_id, ip=null, nickname="") => {
    if (exports.check_user_in_room(username)) {
        return {
            status: false,
            errcode: 3,
            msg: "already in another room",
        }
    }
    if (!exports.check_room_exists(room_id)) {
        return {
            status: false,
            errcode: 1,
            msg: "room does not exist!",
        }
    }

    let info = exports.details.get(room_id);
    if (info.num_of_players >= 3) {
        return {
            status: false,
            errcode: 2,
            msg: "room full!",
        }
    }

    let i = 0;
    for (i = 0; i < 3; ++i) {
        if (info.players[i] == null) {
            break;
        }
    }
    exports.details.get(room_id).players[i] = {
        username: username,
        nickname: nickname,
        cardsOnHand: new Map(),
        cardsDiscarded: [],
        cardsAlreadyUsed: [],
        card21st: '',
        xi: 0,
        seat_id: i,
        ip: ip,
        score: 0,
        online: true,
        ready: true
    };
    exports.details.get(room_id).num_of_players += 1;
    user_room_map.set(username, room_id);
    return {
        status: true,
        errcode: 0,
        msg: "ok",
        seat_id: i,
        player_info: exports.details.get(room_id).players[i],
    }
};

exports.delete_room = (room_id) => {
    exports.current_num_of_rooms -= 1;
    exports.details.delete(parseInt(room_id));
};

exports.leave_room = (username, room_id) => {
    console.log("leave room is called ", username);
    user_room_map.delete(username);
    let info = exports.details.get(room_id);
    let i = 0;
    for (i = 0; i < 3; ++i) {
        if (info.players[i] !== null && info.players[i].username === username) {
            info.players[i] = null;
        }
    }
    info.num_of_players -= 1;
    if (info.num_of_players === 0) {
        exports.delete_room(room_id);
    }
};

exports.get_other_players = (username, room_id) => {
    let i = 0;
    let ids = [];
    let info = exports.details.get(room_id);
    for (i = 0; i < 3; ++i) {
        if (info.players[i] !== null && info.players[i].username !== username) {
            ids.push(info.players[i]);
        }
    }
    return ids;
};

exports.selectHighestPriorityWithoutGuo = (current_status) => {
    let highestPriorityPlayerId = null;
    let highestPriority = 2;
    for (let i = 0; i < 3; ++i) {
        if (current_status.respondedUser[i] !== null && current_status.respondedUser[i].type !== 'guo' && current_status.priority[i] < highestPriority) {
            highestPriority = current_status.priority[i];
            highestPriorityPlayerId = i;
        }
    }

    return highestPriorityPlayerId;
};


