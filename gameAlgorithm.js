let roomManager = null;
exports.init_room_manager = (room_manager) => {
    roomManager = room_manager;
};

exports.check_if_game_can_start = (room_id) => {
    let roomInfo = roomManager.get_room_info(room_id);
    console.log("check_if_game_can_startr  ", roomInfo);
    if (roomInfo === undefined || roomInfo.num_of_players < 3) {
        return false;
    }

    for (player of roomInfo.players) {
        if (player.ready === false || player.online === false) {
            return false;
        }
    }
    return true;
};

let generateAllCardSet = () => {
    let cards = [];
    for (let i = 0; i <= 20; ++i) {
        let key = 'x' + i.toString();
        if (i > 10) {
            key = 'd' + (i - 10).toString();
        }
        for (let j = 0; j < 4; ++j) {
            cards.push(key);
        }
    }
    return cards;
};

let shuffle = (cards) => {
    return cards.map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value)
};

let assign_cards_when_game_start = (roomInfo) => {
    for (let i = 0; i < 61; ) {
        for (let j = 0; j < 3; ++j, ++i) {
            roomInfo.players[j].cardsOnHand.push(roomInfo.current_hole_cards[i]);
        }
    }
    roomInfo.current_hole_cards.splice(0, 61);
}

exports.init_game = (room_id) => {
    let roomInfo = roomManager.get_room_info(room_id);
    if (roomInfo === undefined) {
        return false;
    }

    roomInfo.current_hole_cards = shuffle(generateAllCardSet());
    assign_cards_when_game_start(roomInfo);
    roomInfo.current_played_games = 1;
};