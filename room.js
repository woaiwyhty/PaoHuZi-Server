

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
        last_join_seat_id: 0,
        current_played_games: 0,
        num_of_players: 0,
        current_status: {
            session_key: 0,
            priority: [2, 2, 2],
            respondedUser: [null, null, null],
            respondedNums: 0,
            numOfRequiredResponse: 0,
            op_card: '',
            dealed_seat_id: -1,
        },
        next_instruction: {
            seat_id: 0,
            type: 0, // 0: shoot card, 1: deal card
        },
        waiting_response_from: -1, // -1: no need to wait anyone
        players: [ null, null, null ],
        current_hole_cards: [],
        current_hole_cards_cursor: 0,
        at_the_beginning: false,
        total_games: parseInt(rounds),
        number_of_wang: 0,
        cancel_room_deadline_if_not_start: 180,
        current_on_turn_player_id: 0,
        is_last_card_dealed: 0, // 0: unknown, 1: deal, 2: shoot
        game_state: 0, // 0: not start, 1: in_game, 2: room completed
    });

    exports.current_num_of_rooms += 1;
    return {
        status: true,
        msg: "ok",
        room_id: room_id,
    }
};

exports.init_new_session = (current_status, priority, numOfRequiredResponse, op_card = '', dealed_seat_id = -1) => {
    current_status.session_key += 1;
    current_status.priority = priority;
    current_status.respondedUser = [null, null, null];
    current_status.respondedNums = 0;
    current_status.numOfRequiredResponse = numOfRequiredResponse;
    current_status.op_card = op_card; // will be set when the card is dealed.
    current_status.dealed_seat_id = dealed_seat_id; // will be set when the card is dealed.
};

exports.clear_session = (current_status) => {
    current_status.numOfRequiredResponse = 0;
}

exports.check_room_exists = (room_id) => {
    return exports.details.has(room_id);
};

exports.check_user_in_room = (username) => {
    return user_room_map.has(username);
};

exports.check_rejoin = (username, room_id) => {
    return user_room_map.has(username) && user_room_map.get(username) === room_id && exports.get_room_info(room_id).game_state === 1;
}

exports.check_room_end = (room_id) => {
    return exports.get_room_info(room_id).game_state !== 2;
}

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
        cardsChooseToNotUsed: [],
        ti_pao_counter: 0,
        card21st: '',
        xi: 0,
        seat_id: i,
        ip: ip,
        score: 0,
        online: true,
        ready: true,
        opeartion: null,
        operationTimer: null,
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
        info.game_state = 2;
        console.log("info is  ", info);
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

const typePriority = {
    'ti': 0,
    'wei': 0,
    'pao': 1,
    'hu': 2,
    'peng': 3,
    'chi': 4,
};
exports.selectHighestPriorityWithoutGuo = (current_status) => {
    let highestPriorityPlayerId = null;
    let highestPriority = 2;
    for (let i = 0; i < 3; ++i) {
        let info = current_status.respondedUser[i];
        if (info !== null && info.type !== 'guo') {
            let pa = typePriority[info.type];
            let pb = highestPriorityPlayerId === null ? 10 : typePriority[current_status.respondedUser[highestPriorityPlayerId].type];
            if (highestPriorityPlayerId === null || pa < pb ||
                (current_status.priority[i] < highestPriority && pa === pb)) {
                highestPriority = current_status.priority[i];
                highestPriorityPlayerId = i;
            }
        }
    }

    return highestPriorityPlayerId;
};


exports.filterImportantProperties = (players) => {
    let result = [];
    for (let player of players) {
        result.push({
            username: player.username,
            nickname: player.nickname,
            cardsDiscarded: player.cardsDiscarded,
            cardsAlreadyUsed: player.cardsAlreadyUsed,
            cardsChooseToNotUsed: player.cardsChooseToNotUsed,
            ti_pao_counter: player.ti_pao_counter,
            xi: player.xi,
            seat_id: player.seat_id,
            ip: player.ip,
            score: player.score,
            online: player.online,
            ready: player.ready,
            operation: player.operation,
        });
    }
    return result;
};