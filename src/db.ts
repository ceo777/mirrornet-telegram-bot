/** Mongo Database connection */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

/** */
    /**
     * Connection URI. See https://docs.mongodb.com/ecosystem/drivers/node/ for more details
     */
export class MongoDB {
    private readonly DB_URI: string;

    /**
     * The Mongo Client you will use to interact with your database.
     * See https://mongodb.github.io/node-mongodb-native/3.6/api/MongoClient.html for more details.
     * In case: '[MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated...'
     * pass option { useUnifiedTopology: true } to the MongoClient constructor.
     * const client =  new MongoClient(uri, {useUnifiedTopology: true})
     */
    public readonly client: MongoClient;

    constructor() {
        if (process.env.DB_USERNAME && process.env.DB_PASSWORD) {
            this.DB_URI = 'mongodb://' +
                process.env.DB_USERNAME + ':' +
                process.env.DB_PASSWORD + '@' +
                process.env.DB_HOST + ':' +
                process.env.DB_PORT + '/' +
                process.env.DB_NAME + '?' +
                process.env.DB_ARGS;
        } else {
            this.DB_URI = 'mongodb://' +
                process.env.DB_HOST + ':' +
                process.env.DB_PORT + '/' +
                process.env.DB_NAME + '?' +
                process.env.DB_ARGS;
        }
        this.client = new MongoClient(this.DB_URI, { monitorCommands: true });
        console.log('MongoDB connection has been established.');
        // this.client.on('commandStarted', started => console.log(started));
    }
}