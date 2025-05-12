<h1 align="center">
    <img src="./assets/pigeon.svg" height="200" alt=""/><br>
    Pigeon
</h1>

Pigeon is a TypeScript-based tool for generating TypeScript classes and methods from PostgreSQL database schemas. It
simplifies the process of interacting with your database by generating boilerplate code for you.

## Features

- Generates TypeScript classes for your PostgreSQL tables.
- Supports primary and foreign key relationships.
- Provides methods for querying all rows or specific rows based on keys.
- Command-line interface for easy usage.

## Installation

To install Pigeon, you need to have Node.js and npm installed. Then, you can install it using npm:

```sh
npm install --save-dev @andymic/pigeon
```

## Usage

### CLI

Pigeon provides a command-line interface for generating TypeScript classes and methods.

```sh
npx pigeon [options]
```

#### Options

- `--init`: Sets up the config file. Creates a .pigeon.json file at the root of the project.
- `--guided`: Run Pigeon using a question-based command line interface.
- `--force`: Overwrites already existing files.
- `--output` [path:String]: Output directory for the generated files.
- `--config` [path:String]: Path to .pigeon.json config file.
- `--pgAdmin` [path:String] path to the pgAdmin ERD file.
- `--offline` (only with pgAdmin) does not contact the database

#### Examples

```
pigeon --init
pigeon --output C:/Users/User/Documents/Project
pigeon --output ./generatedFiles --force
pigeon --config ./customPigeonConfig.json
pigeon --pgAdmin C:/Users/User/Documents/Project/ERD.json --offline
pigeon --output C:/Users/User/Documents/Project/pigeon --pgAdmin C:/Users/User/Documents/Project/ERD.json
```

### Programmatic Usage

You can also use Pigeon programmatically in your TypeScript code.

```typescript
import {Database, queryDB, runGeneration} from '@andymic/pigeon';

const database = new Database('localhost', '5432', 'database', 'username', 'password');
const queryResult = await queryDB(database);
if (queryResult instanceof PigeonError)
    return queryResult;

const generationResult = runGeneration('output/directory', database, queryResult.tables, queryResult.enums);
if (generationResult instanceof PigeonError)
    return generationResult;
```

### pgAdmin ERD

Pigeon supports generating code from pgAdmin ERD files. To do that the necessary `--pgAdmin` flag needs to point to the
ERD file.

The `--offline` flag prevents any contact with the database. A side effect of that is that the enum labels cannot be
populated.

## Configuration

Pigeon requires a configuration file `.pigeon.json` to connect to your PostgreSQL database. You can generate this file
using the `--init` option.

```json
{
  "host": "localhost",
  "port": 5432,
  "database": "postgres",
  "username": "postgres",
  "password": "xxx"
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the Apache 2.0 License.