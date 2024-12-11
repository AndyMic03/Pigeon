import {runQuery} from "./utils.js"
import {types} from "./maps.js"
import fs from "node:fs";
import * as path from "node:path";

function createDir(dirPath: string) {
    if (fs.existsSync(dirPath))
        fs.readdir(dirPath, (err, files) => {
            if (err)
                throw err;
            for (const file of files) {
                const dir = path.join(dirPath, file);
                if (fs.lstatSync(dir).isDirectory())
                    fs.rm(dir, {recursive: true, force: true}, (err) => {
                        if (err) throw err;
                    })
                else
                    fs.unlink(path.join(dirPath, file), (err) => {
                        if (err)
                            throw err;
                    });
            }
        });
    else
        fs.mkdir(dirPath, (err) => {
            if (err) throw err;
        });
}

createDir("../gen");

async function getParameters(): Promise<void> {
    const tableQuery = await runQuery(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN
               ('pg_catalog', 'information_schema');`,
        [],
        "localhost",
        23456,
        "compass",
        "andy",
        "xxx"
    );
    if (typeof tableQuery === "undefined")
        throw "SQL Error";

    let schemas: string[] = [];
    for (const table of tableQuery.rows) {
        if (schemas.includes(table.table_schema))
            continue;
        schemas.push(table.table_schema);
    }
    for (const schema of schemas) {
        createDir("../gen/" + schema);
    }

    for (const table of tableQuery.rows) {
        const columnQuery = await runQuery(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_name = $1::varchar
               AND table_schema = $2::varchar;`,
            [table.table_name, table.table_schema],
            "localhost",
            23456,
            "compass",
            "andy",
            "xxx"
        );
        if (typeof tableQuery === "undefined")
            throw "SQL Error";

        let ts = "import {Client} from \"pg\";\n\n";
        ts += "export class " + table.table_name + " {\n";
        for (const column of columnQuery.rows) {
            ts += "\t" + column.column_name + ": " + types.get(column.data_type);
            if (column.is_nullable == "YES")
                ts += " | undefined";
            if (column.column_default !== null) {
                if (!column.column_default.includes("nextval")) {
                    if (types.get(column.data_type) === "Date") {
                        if (column.column_default)
                            ts += " = new Date()";
                        else
                            ts += " = new Date(" + column.column_default.replace(' ', 'T') + ")";
                    } else if (types.get(column.data_type) === "number")
                        ts += " = " + column.column_default;
                    else
                        ts += " = \"" + column.column_default + "\"";
                }
            }
            ts += ";\n"
        }

        ts += "\n";
        ts += "\tconstructor(";
        for (const column of columnQuery.rows) {
            ts += column.column_name + ": " + types.get(column.data_type);
            if (column.is_nullable == "YES")
                ts += " | undefined";
            ts += ", ";
        }
        ts = ts.slice(0, -2);
        ts += ") {\n";

        for (const column of columnQuery.rows)
            ts += "\t\tthis." + column.column_name + " = " + column.column_name + ";\n";
        ts += "\t}\n";
        ts += "}";

        fs.writeFileSync("../gen/" + table.table_schema + "/" + table.table_name + ".ts", ts);
    }
}

getParameters();