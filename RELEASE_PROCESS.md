# Release Process

## Versioning

When releasing a new version of `agent-memory`, the version number must be updated in the following locations:

1.  **`package.json`**: Update the `version` field.
2.  **`src/mcp/server.ts`**: Update the `version` property in the `Server` constructor configuration (search for `new Server`).
    ```typescript
    const server = new Server(
      {
        name: 'agent-memory',
        version: '0.8.0', // <--- Update this
      },
      // ...
    );
    ```

## Step-by-Step Guide

1.  **Update Version Numbers**:
    - Modify `package.json`.
    - Modify `src/mcp/server.ts`.

2.  **Sync Lockfile**:
    Run `npm install` to automatically update `package-lock.json` with the new version.

    ```bash
    npm install
    ```

3.  **Run Tests**:
    Ensure all tests pass before committing.

    ```bash
    npm test
    ```

4.  **Build**:
    Ensure the project builds cleanly.

    ```bash
    npm run build
    ```

5.  **Commit and Push**:
    Commit the changes with a release message.

    ```bash
    git add .
    git commit -m "chore: release v0.8.0"
    git push
    ```

6.  **Tag (Optional)**:
    Create a git tag for the release.

    ```bash
    git tag v0.8.0
    git push origin v0.8.0
    ```
