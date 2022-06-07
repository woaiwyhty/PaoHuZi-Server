let gameAlgorithm = null;

exports.init = (gameAlgorithm_) => {
    gameAlgorithm = gameAlgorithm_;
}

exports.determineCardForShoot = (playerInfo) => {
    for (const [key, value] of playerInfo.cardsOnHand.entries()) {
        if (value < 3 && value > 0) {
            return key;
        }
    }
    return null;
};

exports.processCommand = (message, data, socket, playerInfo) => {
    switch(message) {
        case 'new_player_entered_room':
            break;
        case 'other_player_hu':
            break;
        case 'other_player_action':
            break;
        case 'other_player_shoot':
            break;
        case 'other_player_exit':
            break;
        case 'need_shoot':
            break;
        case 'dealed_card':
            break;
        case 'self_action_result':
            break;
        case 'discarded_dealed_card':
            break;
        case 'check_dihu':
            break;
        default:
        // code block
    }
};