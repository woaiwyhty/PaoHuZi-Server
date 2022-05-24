const crypto = require('crypto');

exports.current_num_of_online_users = 0;
exports.online_users_info = new Map();

exports.new_user = (collection_account, username, encrypted_password) => {
    collection_account.insert({
        username: username,
        encrypted_password: encrypted_password
    }, (err, res) => {
        if (err) throw err;
        console.log("New User: ", username, "  ", encrypted_password);
    });
};

exports.verify_guest = (collection_account, username, callback) => {
    collection_account.findOne({"username": username}, callback);
};

exports.new_guest = (collection_account, username, nickname, callback) => {
    collection_account.insertOne({"username": username, "nickname": nickname}, callback);
};

let rand = () => {
    return Math.random().toString(36).substr(2); // remove `0.`
};

let generate_token = () => {
    return rand() + rand();
};

exports.online = (username, nickname) => {
    // make sure username exists before making the call
    let token = generate_token();
    exports.online_users_info.set(username, {
        token: token,
        nickname: nickname,
        lastActiveTime: Date.now(),
        current_room_id: null,
    });

    return token;
};

exports.join_room = (username, room_id) => {
    // make sure username exists before making the call
    exports.online_users_info.get(username).current_room_id = room_id;
};

exports.get_nick_name = (username) => {
    return exports.online_users_info.get(username).nickname;
};

exports.validate_online = (username, token) => {
    if (exports.online_users_info.has(username) && exports.online_users_info.get(username).token === token) {
        exports.online_users_info.get(username).lastActiveTime = Date.now();
        return true;
    }
    return false;
};

exports.is_user_already_in_room = (username) => {
    return exports.online_users_info.get(username).current_room_id != null;
};

