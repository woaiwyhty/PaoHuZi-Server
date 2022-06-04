let roomManager = null;
exports.init_room_manager = (room_manager) => {
    roomManager = room_manager;
};

exports.check_if_game_can_start = (room_id) => {
    let roomInfo = roomManager.get_room_info(room_id);
    // console.log("check_if_game_can_startr  ", roomInfo);
    if (roomInfo === undefined || roomInfo.num_of_players < 3) {
        return false;
    }

    for (let player of roomInfo.players) {
        if (player.ready === false || player.online === false) {
            return false;
        }
    }
    return true;
};

let generateAllCardSet = () => {
    let cards = [];
    for (let i = 1; i <= 20; ++i) {
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
    for (let i = 1; i <= 20; ++i) {
        let key = 'x' + i.toString();
        if (i > 10) {
            key = 'd' + (i - 10).toString();
        }
        roomInfo.players[0].cardsOnHand.set(key, 0);
        roomInfo.players[1].cardsOnHand.set(key, 0);
        roomInfo.players[2].cardsOnHand.set(key, 0);
    }
    for (let i = 0; i < 60; ) {
        for (let j = 0; j < 3; ++j, ++i) {
            if (i === 60) {
            }
            roomInfo.players[j].cardsOnHand.set(
                roomInfo.current_hole_cards[i],
                roomInfo.players[j].cardsOnHand.get(roomInfo.current_hole_cards[i]) + 1
            );
        }
    }
    roomInfo.players[0].cardsOnHand.set(
        roomInfo.current_hole_cards[60],
        roomInfo.players[0].cardsOnHand.get(roomInfo.current_hole_cards[60]) + 1
    );
    // for (let i = 1; i <= 20; ++i) {
    //     let key = 'x' + i.toString();
    //     if (i > 10) {
    //         key = 'd' + (i - 10).toString();
    //     }
    //     roomInfo.players[1].cardsOnHand.set(key, 0);
    //     // roomInfo.players[2].cardsOnHand.set(key, 0);
    //
    // }
    // roomInfo.players[0].cardsOnHand.set('d5', 4);
    // roomInfo.players[0].cardsOnHand.set('x3', 3);
    // roomInfo.players[0].cardsOnHand.set('d2', 3);
    // roomInfo.players[0].cardsOnHand.set('d7', 3);
    // roomInfo.players[0].cardsOnHand.set('d10', 3);
    // roomInfo.players[0].cardsOnHand.set('x10', 3);
    // roomInfo.players[0].cardsOnHand.set('x1', 3);
    // roomInfo.players[0].cardsOnHand.set('x8', 2);
    //
    // roomInfo.players[1].cardsOnHand.set('d5', 3);
    // roomInfo.players[1].cardsOnHand.set('x3', 3);
    // roomInfo.players[1].cardsOnHand.set('d2', 2);
    // roomInfo.players[1].cardsOnHand.set('d7', 3);
    // roomInfo.players[1].cardsOnHand.set('d10', 3);
    // roomInfo.players[1].cardsOnHand.set('x10', 3);
    // roomInfo.players[1].cardsOnHand.set('x1', 3);
    // roomInfo.players[1].cardsOnHand.set('x8', 3);
    // roomInfo.players[2].cardsOnHand.set('d5', 4);
    // roomInfo.players[2].cardsOnHand.set('x3', 3);
    // roomInfo.players[2].cardsOnHand.set('d2', 3);
    // roomInfo.players[2].cardsOnHand.set('d7', 3);
    // roomInfo.players[2].cardsOnHand.set('d10', 3);
    // roomInfo.players[2].cardsOnHand.set('x10', 3);
    // roomInfo.players[2].cardsOnHand.set('x1', 3);
    // roomInfo.players[2].cardsOnHand.set('x8', 2);

    // roomInfo.players[0].card21st = 'x8';
    // roomInfo.players[1].card21st = 'x8';
    // roomInfo.players[2].card21st = 'x8';

    // roomInfo.players[0].card21st = roomInfo.current_hole_cards[60];
    // roomInfo.players[1].card21st = roomInfo.current_hole_cards[60];
    // roomInfo.players[2].card21st = roomInfo.current_hole_cards[60];

    roomInfo.current_hole_cards_cursor = 61;
    // roomInfo.current_hole_cards.splice(0, 61);
}

exports.init_game = (room_id) => {
    let roomInfo = roomManager.get_room_info(room_id);
    if (roomInfo === undefined) {
        return false;
    }

    for (let i = 0; i < 3; ++i) {
        roomInfo.players[i].cardsOnHand = new Map();
        roomInfo.players[i].cardsDiscarded = [];
        roomInfo.players[i].cardsAlreadyUsed = [];
        roomInfo.players[i].cardsChooseToNotUsed = [];
        roomInfo.players[i].ti_pao_counter = 0;
        roomInfo.players[i].card21st = '';
        roomInfo.players[i].xi = 0;
    }
    roomInfo.at_the_beginning = false;
    roomInfo.current_status = {
        session_key: 0,
        priority: [2, 2, 2],
        respondedUser: [null, null, null],
        respondedNums: 0,
        numOfRequiredResponse: 0,
        op_card: '',
        dealed_seat_id: -1,
    };
    roomInfo.next_instruction = {
        seat_id: 0,
        type: 0, // 0: shoot card, 1: deal card
    };
    roomInfo.current_hole_cards = shuffle(generateAllCardSet());
    assign_cards_when_game_start(roomInfo);
    roomInfo.current_played_games += 1;
};

exports.check_ti_valid = (cardsOnHand, card) => {
    return (cardsOnHand.has(card) && cardsOnHand.get(card) === 4) || (cardsOnHand.has(card) && cardsOnHand.get(card) === 3);
};

exports.check_pao_valid = (cardsOnHand, card) => {
    return cardsOnHand.has(card) && cardsOnHand.get(card) === 3;
};

exports.check_wei_valid = (cardsOnHand, card) => {
    return cardsOnHand.has(card) && cardsOnHand.get(card) === 2;
};

const xiArray = {
    'da_peng': 3,
    'da_wei': 6,
    'da_pao': 9,
    'da_ti': 12,
    'xiao_wei': 3,
    'xiao_pao': 6,
    'xiao_peng': 1,
    'xiao_ti': 9,
    'xiao_sp_chi': 3,
    'da_sp_chi': 6,
};
const chiMap = {
    'x1':  [['x1', 'x2', 'x3'], ['x1', 'x1', 'd1'], ['x1', 'd1', 'd1']] ,
    'x2':  [['x1', 'x2', 'x3'], ['x2', 'x3', 'x4'], ['x2', 'x2', 'd2'], ['x2', 'd2', 'd2'], ['x2', 'x7', 'x10']] ,
    'x3':  [['x1', 'x2', 'x3'], ['x2', 'x3', 'x4'], ['x3', 'x4', 'x5'], ['x3', 'x3', 'd3'], ['x3', 'd3', 'd3']] ,
    'x4':  [['x2', 'x3', 'x4'], ['x3', 'x4', 'x5'], ['x4', 'x5', 'x6'], ['x4', 'x4', 'd4'], ['x4', 'd4', 'd4']] ,
    'x5':  [['x3', 'x4', 'x5'], ['x4', 'x5', 'x6'], ['x5', 'x6', 'x7'], ['x5', 'x5', 'd5'], ['x5', 'd5', 'd5']] ,
    'x6':  [['x4', 'x5', 'x6'], ['x5', 'x6', 'x7'], ['x6', 'x7', 'x8'], ['x6', 'x6', 'd6'], ['x6', 'd6', 'd6']] ,
    'x7':  [['x5', 'x6', 'x7'], ['x6', 'x7', 'x8'], ['x7', 'x8', 'x9'], ['x7', 'x7', 'd7'], ['x7', 'd7', 'd7'], ['x2', 'x7', 'x10']] ,
    'x8':  [['x6', 'x7', 'x8'], ['x7', 'x8', 'x9'], ['x8', 'x9', 'x10'], ['x8', 'x8', 'd8'], ['x8', 'd8', 'd8']] ,
    'x9':  [['x7', 'x8', 'x9'], ['x8', 'x9', 'x10'], ['x9', 'x9', 'd9'], ['x9', 'd9', 'd9']] ,
    'x10':  [['x8', 'x9', 'x10'], ['x10', 'x10', 'd10'], ['x10', 'd10', 'd10'], ['x2', 'x7', 'x10']] ,
    'd1':  [['d1', 'd2', 'd3'], ['d1', 'd1', 'x1'], ['d1', 'x1', 'x1']] ,
    'd2':  [['d1', 'd2', 'd3'], ['d2', 'd3', 'd4'], ['d2', 'd2', 'x2'], ['d2', 'x2', 'x2'], ['d2', 'd7', 'd10']] ,
    'd3':  [['d1', 'd2', 'd3'], ['d2', 'd3', 'd4'], ['d3', 'd4', 'd5'], ['d3', 'd3', 'x3'], ['d3', 'x3', 'x3']] ,
    'd4':  [['d2', 'd3', 'd4'], ['d3', 'd4', 'd5'], ['d4', 'd5', 'd6'], ['d4', 'd4', 'x4'], ['d4', 'x4', 'x4']] ,
    'd5':  [['d3', 'd4', 'd5'], ['d4', 'd5', 'd6'], ['d5', 'd6', 'd7'], ['d5', 'd5', 'x5'], ['d5', 'x5', 'x5']] ,
    'd6':  [['d4', 'd5', 'd6'], ['d5', 'd6', 'd7'], ['d6', 'd7', 'd8'], ['d6', 'd6', 'x6'], ['d6', 'x6', 'x6']] ,
    'd7':  [['d5', 'd6', 'd7'], ['d6', 'd7', 'd8'], ['d7', 'd8', 'd9'], ['d7', 'd7', 'x7'], ['d7', 'x7', 'x7'], ['d2', 'd7', 'd10']] ,
    'd8':  [['d6', 'd7', 'd8'], ['d7', 'd8', 'd9'], ['d8', 'd9', 'd10'], ['d8', 'd8', 'x8'], ['d8', 'x8', 'x8']] ,
    'd9':  [['d7', 'd8', 'd9'], ['d8', 'd9', 'd10'], ['d9', 'd9', 'x9'], ['d9', 'x9', 'x9']] ,
    'd10':  [['d8', 'd9', 'd10'], ['d10', 'd10', 'x10'], ['d10', 'x10', 'x10'], ['d2', 'd7', 'd10']] ,
}

const cardRed = ['x2', 'x7', 'x10', 'd2', 'd7', 'd10'];
exports.calculate_xi = (type, card) => {
    let key;
    if (Array.isArray(card)) {
        let mycard = Array.from(card);
        mycard.sort();
        if (mycard.toString() === ['d1', 'd2', 'd3'].toString() ||
            mycard.toString() === ['d10', 'd2', 'd7'].toString()) {
            return 6;
        }
        if (mycard.toString() === ['x1', 'x2', 'x3'].toString() ||
            mycard.toString() === ['x10', 'x2', 'x7'].toString()) {
            return 3;
        }
        return 0;
    }
    if (card[0] === 'x') {
        return xiArray['xiao_' + type];
    } else {
        return xiArray['da_' + type];
    }
}

exports.check_card_valid = (card) => {
    if (card.length >= 2 && (card[0] === 'd' || card[0] === 'x')) {
        let remain = parseInt(card.slice(1));
        return remain >= 1 && remain <= 10;
    }
    return false;
};

exports.checkTi = function(cards, dealedCard) {
    let tiResult = [];
    if (dealedCard) {
        if (cards.get(dealedCard) === 3) {
            tiResult.push(dealedCard);
        }
    }
    for (const [key, value] of cards.entries()) {
        if (value === 4) {
            tiResult.push(key);
        }
    }
    return tiResult;
}

exports.checkPeng = function(shootedCard, cardsOnHand) {
    return cardsOnHand.get(shootedCard) === 2;
}

exports.checkWei = function(dealedCard, cardsOnHand) {
    if (dealedCard) {
        return cardsOnHand.get(dealedCard) === 2;
    }

    let result = []
    for (const [card, value] of cardsOnHand.entries()) {
        if (value === 3) {
            result.push(card);
        }
    }
    return result;
}

exports.checkPao = function(card, isShoot, cardsOnHand, cardsAlreadyUsed) {
    // case1: 3 cards on hand and other shooted/dealed one
    // case2: 3 wei cards and other shooted/dealed one
    // case3: 3 peng cards and others dealed one
    let case1 = cardsOnHand.get(shootCard) === 3 ? -1 : -2;
    if (cardsOnHand.get(shootCard) === 3) {
        return {
            status: true,
            caseNumber: 1,
        };
    }
    let id = 0;
    for (let usedCards of cardsAlreadyUsed) {
        if (usedCards.type === 'wei') {
            if ( usedCards.cards[2] === card) {
                return {
                    status: true,
                    caseNumber: 2,
                    index: id,
                };
            }
        } else if (usedCards.type === 'peng') {
            if ((usedCards.cards[2] === card) && (isShoot === false)) {
                return {
                    status: true,
                    caseNumber: 3,
                    index: id,
                }
            }
        }
        id += 1;
    }
    return {
        status: false,
    }
}

let checkChiOnlyOnHandDfs = function(card, cardsOnHand, finalResult, currentResult) {
    if (cardsOnHand.get(card) === 0) {
        finalResult.push(currentResult);
        return;
    }
    for (possibility of chiMap[card]) {
        let result = true;
        for (let oneCard of possibility) {
            if (!(cardsOnHand.get(oneCard) === 1 || cardsOnHand.get(oneCard) === 2)) {
                result = false;
                break;
            }
        }
        if (result === true) {
            let newResult = Array.from(currentResult);
            newResult.push(possibility);
            for (oneCard of possibility) {
                cardsOnHand.set(oneCard, cardsOnHand.get(oneCard) - 1);
            }
            checkChiOnlyOnHandDfs(card, cardsOnHand, finalResult, newResult);
            for (oneCard of possibility) {
                cardsOnHand.set(oneCard, cardsOnHand.get(oneCard) + 1);
            }
        }
    }
}

exports.checkChi = function(card, cardsOnHand) {
    if (cardsOnHand.get(card) >= 3) {
        return {
            status: false
        };
    }
    let tempCardSet = new Map(JSON.parse(
        JSON.stringify(Array.from(cardsOnHand))
    ));
    tempCardSet.set(card, tempCardSet.get(card) + 1);
    let finalResult = [];
    let currentResult = [];
    // we may chi multiple times to make sure we don't have the same dealed card on hand.
    // it is necessary to use dfs to find all possibilities.
    checkChiOnlyOnHandDfs(card, tempCardSet, finalResult, currentResult);
    if (finalResult.length > 0) {
        for (let item of finalResult) {
            item.sort();
        }
        finalResult = finalResult.sort().filter((item, pos, array) => {
            return !pos || item.toString() !== array[pos - 1].toString();
        });
        for (let result of finalResult) {
            for (let item of result) {
                for (let i = 0; i < 2; ++i) {
                    if (item[i] === card) {
                        item[i] = item[2];
                        item[2] = card;
                    }
                }
            }
        }
    }
    return {
        status: finalResult.length > 0,
        chiWays: finalResult,
    };
}

let groupCardsBy3Dfs = function(cardsOnHand, numOfCards, finalResult, currentResult) {
    // cardsOnHand must have no jiang and no wei
    if (numOfCards < 3) {
        if (numOfCards === 0) {
            // FIND A MATCH!!! Yeahhh!!!!
            for (current of currentResult) {
                current.xi = exports.calculate_xi('chi', current.cards);
            }
            finalResult.push(currentResult);
        }
        return;
    }
    for (const [card, value] of cardsOnHand.entries()) {
        if (value === 0) {
            continue;
        }

        if (!chiMap[card]) {
            console.log('error   ', card, cardsOnHand);
        }
        for (let possibility of chiMap[card]) {
            let result = true;
            for (let oneCard of possibility) {
                cardsOnHand.set(oneCard, cardsOnHand.get(oneCard) - 1);
            }
            for (let oneCard of possibility) {
                if (cardsOnHand.get(oneCard) < 0) {
                    result = false;
                    for (let oneCard1 of possibility) {
                        cardsOnHand.set(oneCard1, cardsOnHand.get(oneCard1) + 1);
                    }
                    break;
                }
            }
            if (result === true) {
                let newResult = Array.from(currentResult);
                newResult.push({
                    type: 'chi',
                    cards: possibility,
                    xi: 0, // calculate later to save time
                });
                // console.log("before group   ", possibility);
                groupCardsBy3Dfs(cardsOnHand, numOfCards - 3, finalResult, newResult);
                // console.log("after group   ", possibility);

                for (let oneCard of possibility) {
                    cardsOnHand.set(oneCard, cardsOnHand.get(oneCard) + 1);
                }
            }
        }
    }
}

let calculateFanAndTun = function(cardsAlreadyUsed, resultFromGroup3) {
    let all = cardsAlreadyUsed.concat(resultFromGroup3);
    let sumOfXi = 0;
    for (group of all) {
        sumOfXi += group.xi;
    }
    if (sumOfXi < 15) {
        return {
            status: false
        };
    }

    let tipaoNum = new Map();
    let numOfRed = 0, numOfBlack = 0, numOfChi = 0, numOfXiao = 0, numOfDa = 0, numOfTuan = 0;
    for (group of all) {
        if (group.type === 'chi') {
            for (card of group.cards) {
                if (cardRed.indexOf(card) >= 0) {
                    numOfRed += 1;
                } else {
                    numOfBlack += 1;
                }
                if (card[0] === 'd') {
                    numOfDa += 1;
                } else {
                    numOfXiao += 1;
                }
            }
            numOfChi += 1;
        } else {
            let cnt = 3;
            if(['ti', 'pao'].indexOf(group.type) >= 0) {
                cnt = 4;
                let oppoCard = group.cards[3].slice(1);
                if (group.cards[3][0] === 'd') {
                    oppoCard = 'x' + oppoCard;
                } else {
                    oppoCard = 'd' + oppoCard;
                }
                tipaoNum.set(group.cards[3], true);
                if (tipaoNum.get(oppoCard)) {
                    numOfTuan += 1;
                }
            }

            if (group.cards[cnt - 1][0] === 'd') {
                numOfDa += cnt;
            } else {
                numOfXiao += cnt;
            }

            if (cardRed.indexOf(group.cards[cnt - 1]) >= 0) {
                numOfRed += cnt;
            } else {
                numOfBlack += cnt;
            }
        }
    }

    let fan = 0;
    let huInfo = [];
    if (numOfRed >= 10) {
        huInfo.push("红胡");
        fan += 4 + (numOfRed - 10);
    }
    if (numOfRed === 0) {
        fan += 8;
        huInfo.push("黑胡");
    }
    if (numOfRed === 1) {
        fan += 6;
        huInfo.push("点胡");
    }
    if (numOfChi === 0) {
        fan += 8;
        huInfo.push("对胡");
    }
    if (numOfDa >= 18) {
        fan += 8 + (numOfDa - 18);
        huInfo.push("大胡");
    }
    if (numOfXiao >= 16) {
        fan += 8 + (numOfXiao - 16);
        huInfo.push("小胡");
    }
    if (numOfTuan > 0) {
        huInfo.push("团胡");
        fan += (numOfTuan) * 8;
    }
    if (!fan) {
        fan = 1;
    }
    return {
        status: true,
        cardsGroups: all,
        fan: fan,
        tun: parseInt((sumOfXi - 12) / 3),
        xi: sumOfXi,
        huInfo: huInfo,
    }
}

let checkHuHelper = function(cardsOnHand, alreadyNeedJiang, currentXi, cardsAlreadyUsed) {
    let tempCardSet = new Map(JSON.parse(
        JSON.stringify(Array.from(cardsOnHand))
    ));
    let groupResult = [];
    for (cardsUsed of cardsAlreadyUsed) {
        groupResult.push({
            type: cardsUsed.type,
            xi: cardsUsed.xi,
            cards: cardsUsed.cards,
        });
    }

    // 4x + 3y + 2
    let tiResult = exports.checkTi(tempCardSet);
    if (!alreadyNeedJiang) {
        alreadyNeedJiang = tiResult.length > 0;
    }
    for (let ti of tiResult) {
        groupResult.push({
            cards: [ti, ti, ti, ti],
            type: 'ti',
            xi: exports.calculate_xi('ti', ti)
        })
        currentXi += groupResult[groupResult.length - 1].xi;
        tempCardSet.set(ti, 0);
    }
    let weiResult = exports.checkWei(null, tempCardSet);
    for (let wei of weiResult) {
        groupResult.push({
            cards: [wei, wei, wei],
            type: 'wei',
            xi: exports.calculate_xi('wei', wei)
        });
        currentXi += groupResult[groupResult.length - 1].xi;
        tempCardSet.set(wei, 0);
    }

    let numOfCards = 0;
    for (const [key, value] of tempCardSet.entries()) {
        numOfCards += value;
    }
    let maxHu = null;
    if (alreadyNeedJiang) {
        for (const a of tempCardSet.entries()) {
            let key = a[0];
            let value = a[1];
            if (value === 2 && (numOfCards - 2) % 3 === 0) {
                // may be jiang
                tempCardSet.set(key, 0);
                let finalResult = [], currentResult = [];
                groupCardsBy3Dfs(tempCardSet, numOfCards - 2, finalResult, currentResult);
                for (let res of finalResult) {
                    let calcResult = calculateFanAndTun(groupResult, res);
                    if (!maxHu || (calcResult.status === true
                        && calcResult.fan * calcResult.tun > maxHu.fan * maxHu.tun)) {
                        maxHu = calcResult;
                    }
                }
                tempCardSet.set(key, 2);
            }
        }
    } else {
        if (numOfCards % 3 === 0) {
            // hu without jiang
            let finalResult = [], currentResult = [];
            groupCardsBy3Dfs(tempCardSet, numOfCards, finalResult, currentResult);
            for (let res of finalResult) {
                let calcResult = calculateFanAndTun(groupResult, res);
                if (!maxHu || (calcResult.status === true
                    && calcResult.fan * calcResult.tun > maxHu.fan * maxHu.tun)) {
                    maxHu = calcResult;
                }
            }
        }
    }
    if (maxHu === null) {
        return {
            status: false,
        };
    }
    return maxHu;
}

exports.checkHu = function(cardsAlreadyUsed, cardsOnHand, currentCard) {
    console.log('check hu start   ', cardsAlreadyUsed, cardsOnHand, currentCard);
    // tian, di, wang should be added later.
    let tempCardSet = new Map(JSON.parse(
        JSON.stringify(Array.from(cardsOnHand))
    ));
    if (currentCard) {
        tempCardSet.set(currentCard, tempCardSet.get(currentCard) + 1);
    }
    let sumOfCardOnHand = 0;
    for (const a of cardsOnHand.entries()) {
        sumOfCardOnHand += a[1];
    }
    let currentXi = 0, needJiang = false;
    for (let cardsUsed of cardsAlreadyUsed) {
        currentXi += cardsUsed.xi;
        if (['pao', 'ti'].indexOf(cardsUsed.type) >= 0) {
            needJiang = true;
        }
    }
    let resultForJiangHu = checkHuHelper(tempCardSet, needJiang, currentXi, cardsAlreadyUsed);
    if (resultForJiangHu && sumOfCardOnHand === 1) {
        resultForJiangHu.huInfo.push("耍猴");
        resultForJiangHu.fan += 8;
    }
    console.log('check hu end   ', resultForJiangHu);
    return resultForJiangHu;
}

exports.check_ti_wei_pao = (op_seat_id, players, dealed_card) => {
    console.log("check_ti_wei_pao  ", players);
    for (let i = 0; i < 3; ++i) {
        let res = false, from_wei_or_peng = 0;
        let type = '';
        if (players[i].cardsOnHand.get(dealed_card) === 3) {
            res = true;
            type = op_seat_id === i ? 'ti' : 'pao';
        }
        for (let usedCard of players[i].cardsAlreadyUsed) {
            if (['wei', 'peng'].indexOf(usedCard.type) >= 0 && usedCard.cards[2] === dealed_card) {
                res = true;
                from_wei_or_peng = usedCard.type === 'wei' ? 1 : 2;
                type = (op_seat_id === i && from_wei_or_peng === 1) ? 'ti' : 'pao';
                break;
            }
        }
        if (res) {
            let cards = ['back', 'back', 'back', dealed_card];
            if (type === 'pao') {
                cards = [dealed_card, dealed_card, dealed_card, dealed_card];
            }
            return {
                status: true,
                type: type,
                from_wei_or_peng: from_wei_or_peng,
                op_seat_id: i,
                opCard: dealed_card,
                cards: cards,
            }
        }
    }

    if (players[op_seat_id].cardsOnHand.get(dealed_card) === 2) {
        return {
            status: true,
            type: 'wei',
            op_seat_id: op_seat_id,
            from_wei_or_peng: 0,
            opCard: dealed_card,
            cards: ['back', 'back', dealed_card],
        }
    }

    return {
        status: false,
    }
};