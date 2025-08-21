# Contributing to Space Based

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This leads to more readable messages that are easy to follow when looking through the project history.

### Commit Message Format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special format that includes a **type**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

### Type

Must be one of the following:

* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **perf**: A code change that improves performance
* **test**: Adding missing tests or correcting existing tests
* **build**: Changes that affect the build system or external dependencies
* **ci**: Changes to our CI configuration files and scripts
* **chore**: Other changes that don't modify src or test files
* **revert**: Reverts a previous commit

### Scope

The scope should be the name of the module affected (as perceived by the person reading the changelog generated from commit messages).

Supported scopes:
* `networking` - Multiplayer, WebSocket, WebRTC
* `world` - Terrain generation, chunks, voxels
* `combat` - Projectiles, damage, weapons
* `ui` - HUD, chat, menus
* `engine` - Core game loop, input, bootstrap
* `camera` - Camera controls and rendering
* `entities` - Ships, junk, materials
* `items` - Collectibles, resources
* `audio` - Sound effects, music
* `graphics` - Rendering, shaders, effects

### Subject

The subject contains a succinct description of the change:

* use the imperative, present tense: "change" not "changed" nor "changes"
* don't capitalize the first letter
* no dot (.) at the end

### Body

Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit **Closes**.

### Examples

#### Simple feature
```
feat(combat): add homing missile weapon type

Missiles now track nearby enemies within a 100 unit radius
using predictive targeting algorithm
```

#### Bug fix with issue reference
```
fix(networking): resolve projectile sync issues between players

Projectiles were not being properly transmitted due to incorrect
direction vector calculation. Now using ship heading for accurate
projectile spawning.

Fixes #42
```

#### Breaking change
```
refactor(world)!: change chunk size from 32x32 to 16x16

BREAKING CHANGE: Existing saved worlds will need to be regenerated
due to incompatible chunk format
```

#### Performance improvement
```
perf(engine): implement object pooling for projectiles

Reduces GC pressure by reusing projectile objects instead of
creating new ones. Improves frame rate by ~15% during combat
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes following the code style
3. Write/update tests as needed
4. Ensure all tests pass (`npm test`)
5. Commit your changes using the convention above
6. Push your branch and create a pull request

## Code Style

* Use TypeScript strict mode
* Follow existing patterns in the codebase
* Keep functions small and focused
* Add types for all parameters and return values
* Use meaningful variable names
* Avoid magic numbers - use named constants

## Testing

* Write tests for new features
* Update tests when modifying existing features
* Ensure all tests pass before committing
* Aim for high code coverage in critical systems