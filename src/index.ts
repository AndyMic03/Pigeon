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

function nameBeautifier(name: string) {
    const words = name.split("_");
    let out = "";
    for (let word of words) {
        word = word[0].toUpperCase() + word.substring(1);
        if (word === "Id")
            word = "ID";
        out += word + " ";
    }
    return out.slice(0, -1);
}

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
        if (typeof columnQuery === "undefined")
            throw "SQL Error";

        const pKeyQuery = await runQuery(
            `SELECT ku.column_name
             FROM information_schema.table_constraints AS tc
                      INNER JOIN information_schema.key_column_usage AS ku
                                 ON tc.constraint_type = 'PRIMARY KEY'
                                     AND tc.constraint_name = ku.constraint_name
             WHERE tc.table_schema = $1::varchar
               AND tc.table_name = $2::varchar;`,
            [table.table_schema, table.table_name],
            "localhost",
            23456,
            "compass",
            "andy",
            "xxx"
        );
        if (typeof pKeyQuery === "undefined")
            throw "SQL Error";

        const fKeyQuery = await runQuery(
            `SELECT kcu1.table_schema AS local_schema,
                    kcu1.table_name   AS local_table,
                    kcu1.column_name  AS local_column,
                    kcu2.table_schema AS referenced_schema,
                    kcu2.table_name   AS referenced_table,
                    kcu2.column_name  AS referenced_column
             FROM information_schema.referential_constraints AS rc
                      INNER JOIN information_schema.key_column_usage AS kcu1
                                 ON kcu1.constraint_catalog = rc.constraint_catalog
                                     AND kcu1.constraint_schema = rc.constraint_schema
                                     AND kcu1.constraint_name = rc.constraint_name
                      INNER JOIN information_schema.key_column_usage AS kcu2
                                 ON kcu2.constraint_catalog = rc.unique_constraint_catalog
                                     AND
                                    kcu2.constraint_schema = rc.unique_constraint_schema
                                     AND kcu2.constraint_name = rc.unique_constraint_name
                                     AND kcu2.ordinal_position = kcu1.ordinal_position
             WHERE kcu1.table_schema = $1::varchar
               AND kcu1.table_name = $2::varchar;`,
            [table.table_schema, table.table_name],
            "localhost",
            23456,
            "compass",
            "andy",
            "xxx"
        );
        if (typeof fKeyQuery === "undefined")
            throw "SQL Error";

        let ts = "import {Client} from \"pg\";\n\n";
        ts += "export class " + table.table_name + " {\n";
        for (const column of columnQuery.rows) {
            let dataType = types.get(column.data_type);
            if (column.is_nullable == "YES")
                dataType += " | undefined";

            let isPrimaryKey = false;
            for (const row of pKeyQuery.rows)
                if (row.column_name === column.column_name)
                    isPrimaryKey = true;
            let foreignKeyIndex = -1;
            for (let i = 0; i < fKeyQuery.rows.length; i++)
                if (fKeyQuery.rows[i].local_column === column.column_name)
                    foreignKeyIndex = i;

            ts += "\t/**\n";
            if (isPrimaryKey)
                ts += "\t * A primary key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(table.table_name) + " table.\n";
            else if (foreignKeyIndex !== -1)
                ts += "\t * A foreign key representing the " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(table.table_name) + " table and referencing the " + nameBeautifier(fKeyQuery.rows[foreignKeyIndex].referenced_column) + " in the " + nameBeautifier(fKeyQuery.rows[foreignKeyIndex].referenced_table) + " table in the " + nameBeautifier(fKeyQuery.rows[foreignKeyIndex].referenced_schema) + " schema.\n";
            else
                ts += "\t * The " + nameBeautifier(column.column_name) + " for the " + nameBeautifier(table.table_name) + " table.\n";

            ts += "\t * @type {" + dataType + "}\n";
            ts += "\t */\n";

            ts += "\t" + column.column_name + ": " + dataType;
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
        ts += "\t/**\n";
        ts += "\t * Creates a new object for the "+nameBeautifier(table.table_name)+ " table.\n";
        ts += "\t * \n"
        for (const column of columnQuery.rows) {
            ts += "\t * ";
            ts += "@param {"+types.get(column.data_type);
            if (column.is_nullable == "YES")
                ts += " | undefined";
            ts += "} " + column.column_name;
            ts += " - The " + nameBeautifier(column.column_name) + " of the " + nameBeautifier(table.table_name) + " table. \n";
        }
        ts += "\t */\n";
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