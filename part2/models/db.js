const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// MySQL 数据库连接配置
const mysqlConfig = {
    host: 'localhost',
    user: 'root',
    password: '816816', // MySQL密码
    database: 'DogWalkService',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
let isMySQL = false;
let sqliteDb;

// 初始化数据库连接
async function initializeConnection() {
    try {
        // 首先尝试连接MySQL并创建数据库
        const tempConfig = { ...mysqlConfig };
        delete tempConfig.database; // 先不指定数据库
        
        const tempConnection = await mysql.createConnection(tempConfig);
        
        // 创建数据库（如果不存在）
        await tempConnection.execute('CREATE DATABASE IF NOT EXISTS DogWalkService');
        await tempConnection.end();
        
        // 现在连接到具体数据库
        pool = mysql.createPool(mysqlConfig);
        const connection = await pool.getConnection();
        connection.release();
        isMySQL = true;
        console.log('✅ MySQL连接成功！数据库已创建');
        return true;
    } catch (mysqlError) {
        console.log('⚠️  MySQL连接失败，尝试使用SQLite:', mysqlError.message);
        
        try {
            // 使用SQLite作为备选
            sqliteDb = await open({
                filename: './dogwalk.db',
                driver: sqlite3.Database
            });
            isMySQL = false;
            console.log('✅ SQLite连接成功！');
            return true;
        } catch (sqliteError) {
            console.error('❌ SQLite连接也失败:', sqliteError.message);
            return false;
        }
    }
}

// 执行SQL查询的统一接口
async function executeQuery(sql, params = []) {
    if (isMySQL) {
        return await pool.execute(sql, params);
    } else {
        // SQLite查询
        if (sql.toLowerCase().includes('select')) {
            const rows = await sqliteDb.all(sql, params);
            return [rows];
        } else {
            const result = await sqliteDb.run(sql, params);
            return [{ insertId: result.lastID, affectedRows: result.changes }];
        }
    }
}

// 测试数据库连接
async function testConnection() {
    return await initializeConnection();
}

// 初始化数据库表和数据
async function initializeDatabase() {
    try {
        await createTables();
        await insertInitialData();
        console.log('✅ 数据库初始化完成！');
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error.message);
    }
}

// 创建数据库表
async function createTables() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY ${isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ${isMySQL ? "ENUM('owner', 'walker', 'admin') NOT NULL" : "TEXT NOT NULL CHECK (role IN ('owner', 'walker', 'admin'))"},
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS Dogs (
            dog_id INTEGER PRIMARY KEY ${isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
            owner_id INTEGER NOT NULL,
            name VARCHAR(50) NOT NULL,
            size ${isMySQL ? "ENUM('small', 'medium', 'large') NOT NULL" : "TEXT NOT NULL CHECK (size IN ('small', 'medium', 'large'))"},
            FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS WalkRequests (
            request_id INTEGER PRIMARY KEY ${isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
            dog_id INTEGER NOT NULL,
            requested_time DATETIME NOT NULL,
            duration_minutes INTEGER NOT NULL,
            location VARCHAR(255) NOT NULL,
            status ${isMySQL ? "ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open'" : "TEXT DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'completed', 'cancelled'))"},
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS WalkApplications (
            application_id INTEGER PRIMARY KEY ${isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
            request_id INTEGER NOT NULL,
            walker_id INTEGER NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ${isMySQL ? "ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending'" : "TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected'))"},
            FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
            FOREIGN KEY (walker_id) REFERENCES Users(user_id),
            UNIQUE (request_id, walker_id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS WalkRatings (
            rating_id INTEGER PRIMARY KEY ${isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
            request_id INTEGER NOT NULL,
            walker_id INTEGER NOT NULL,
            owner_id INTEGER NOT NULL,
            rating INTEGER CHECK (rating BETWEEN 1 AND 5),
            comments TEXT,
            rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
            FOREIGN KEY (walker_id) REFERENCES Users(user_id),
            FOREIGN KEY (owner_id) REFERENCES Users(user_id),
            UNIQUE (request_id)
        )`
    ];

    for (const table of tables) {
        await executeQuery(table);
    }
    
    console.log('✅ 数据库表创建成功！');
}

// 插入初始数据
async function insertInitialData() {
    try {
        // 检查是否已有用户数据
        const [existingUsers] = await executeQuery('SELECT COUNT(*) as count FROM Users');
        const count = existingUsers[0].count || existingUsers[0]['COUNT(*)'];
        
        if (count > 0) {
            console.log('✅ 数据库已有数据，跳过初始化');
            return;
        }

        // 插入用户
        const users = [
            ['alice123', 'alice@example.com', 'hashed123', 'owner'],
            ['bobwalker', 'bob@example.com', 'hashed456', 'walker'],
            ['carol123', 'carol@example.com', 'hashed789', 'owner'],
            ['admin', 'admin@example.com', 'admin123', 'admin']
        ];

        for (const user of users) {
            await executeQuery(
                'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                user
            );
        }

        // 插入狗狗数据
        const dogs = [
            [1, 'Max', 'medium'],  // alice123的狗
            [3, 'Bella', 'small'], // carol123的狗
            [1, 'Buddy', 'large']  // alice123的另一只狗
        ];

        for (const dog of dogs) {
            await executeQuery(
                'INSERT INTO Dogs (owner_id, name, size) VALUES (?, ?, ?)',
                dog
            );
        }

        // 插入遛狗请求
        const walkRequests = [
            [1, '2025-06-10 08:00:00', 30, 'Parklands', 'open'],
            [2, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'open']
        ];

        for (const request of walkRequests) {
            await executeQuery(
                'INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES (?, ?, ?, ?, ?)',
                request
            );
        }

        console.log('✅ 初始数据插入成功！');
    } catch (error) {
        console.error('❌ 初始数据插入失败:', error.message);
    }
}

module.exports = {
    executeQuery,
    testConnection,
    initializeDatabase,
    get isMySQL() { return isMySQL; },
    get pool() { return pool; },
    get sqliteDb() { return sqliteDb; }
};