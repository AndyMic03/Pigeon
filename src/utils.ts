import {Client} from "pg";

export async function runQuery(command: string, parameters: any[], host: string, port: number, db: string, username: string, password: string): Promise<any | undefined> {
    const client = new Client({
        host: host,
        port: port,
        database: db,
        user: username,
        password: password,
    });
    try {
        await client.connect();
        return await client.query(command, parameters);
    } catch (error: any) {
        consoleMessage("ERR", error.toString());
        return undefined;
    } finally {
        await client.end();
    }
}

export function consoleMessage(level: string, message: string) {
    let color;
    switch (level) {
        case 'DBG':
            color = "\x1b[96m";
            break;
        case 'INF':
            color = "\x1b[92m";
            break;
        case 'WRN':
            color = "\x1b[33m";
            break;
        case 'ERR':
            color = "\x1b[91m";
            break;
        case 'CRT':
            color = "\x1b[31m";
            break;
        default:
            color = "\x1b[0m";
    }
    console.log(new Date(Date.now()).toISOString() + " " + color + level + "\x1b[0m " + message);
}