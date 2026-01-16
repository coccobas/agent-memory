# Example Data

This directory contains sample data for the Agent Memory Database.

## bootstrap-data.sql

This SQL file contains sample data to demonstrate the schema and provide a starting point for new installations. It includes:

- **Predefined Tags**: Language, domain, category, and meta tags
- **Default Organization**: A "Personal" organization for single-user setups
- **Sample Project**: The "Agent Memory Database" project with metadata
- **Global Tools**: Examples of tool definitions (file_read, file_write, git_commit, sql_query)
- **Global Guidelines**: Security and behavior guidelines (no hardcoded secrets, read before edit, minimal changes, parameterized SQL)
- **Project Guidelines**: TypeScript-specific guidelines for the project
- **Knowledge Entries**: Architecture decisions and technology choices
- **Entry Relations**: Links between tools, guidelines, and knowledge entries
- **Sample Session**: An active working session

## Usage

To load this data into your database:

```bash
# Make sure your database is initialized
npm run db:migrate

# Load the bootstrap data
sqlite3 data/memory.db < examples/bootstrap-data.sql
```

Or if you're using a different database path:

```bash
sqlite3 /path/to/your/memory.db < examples/bootstrap-data.sql
```

## Notes

- All IDs in this file are hardcoded for demonstration purposes
- In production, you would generate UUIDs dynamically
- The data includes examples of all major features: scoping, versioning, tagging, and relations
- You can modify this file to match your specific needs
