import { Db, MongoClient, ServerApiVersion } from 'mongodb'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB

let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

if (!uri) {
    throw new Error(
        'Please define the MONGODB_URI environment variable inside .env.local'
    )
}

if (!dbName) {
    throw new Error(
        'Please define the MONGODB_DB environment variable inside .env.local'
    )
}
interface Database{
    client:MongoClient,
    db:Db
}
export async function connectToDatabase():Promise<Database> {
    if (cachedClient && cachedDb) {
        return { client : cachedClient, db : cachedDb }
    }

    // @ts-ignore
    const client = await MongoClient.connect(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
        }
    })


    const db = client.db(dbName)

    cachedClient = client
    cachedDb = db

    return { client:client, db:db }
}