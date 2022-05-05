const crypto = require('crypto');

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