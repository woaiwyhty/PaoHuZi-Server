const redis_server = require("redis");
const crypto = require('./crypto');
const mongo_server = require("mongodb").MongoClient;
const url = "mongodb://43.138.67.153:27017/";


const client = redis_server.createClient({
    host: "43.138.67.153", // 默认 host
    port: '6379' // 默认端口
});

// console.log(crypto.md5("wyhty2627"));

client.connect().then(r => {
    if (r) {
        throw r;
    }
    console.log('Connected to Redis.')
});

mongo_server.connect(url, (err, db) => {
    if (err) {
        throw err;
    }

    const dbo = db.db("PaohuziDatabase");

    console.log("Connected to Mongodb.");
    exports.mongo_db = dbo;
    exports.mongo_client = db;
    exports.account_collection = dbo.collection("Accounts");
});

exports.redis_client = client;

