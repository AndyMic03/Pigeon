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
- --guided: Run Pigeon using a question-based command line interface.
- `--force`: Overwrites already existing files.
- `--output` [path:String]: Output directory for the generated files.
- `--config` [path:String]: Path to .pigeon.json config file.

#### Examples

```
pigeon --init
pigeon --output C:/Users/User/Documents/Project
pigeon --output ./generatedFiles --force
pigeon --config ./customPigeonConfig.json
```

### Programmatic Usage

You can also use Pigeon programmatically in your TypeScript code.

```typescript
import {runPigeon} from '@andymic/pigeon';

const result = await runPigeon('output/directory', 'localhost', 5432, 'database', 'username', 'password');
console.log(result.message);
```

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