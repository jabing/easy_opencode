---
name: swift-actor-persistence
description: Thread-safe data persistence in Swift using actors — in-memory cache with file-backed storage, eliminating data races by design.
origin: EOC
---

# Swift Actors for Thread-Safe Persistence

Patterns for building thread-safe data persistence layers using Swift actors. Combines in-memory caching with file-backed storage, leveraging the actor model to eliminate data races at compile time.

## When to Activate

- Building a data persistence layer in Swift 5.5+
- Need thread-safe access to shared mutable state
- Want to eliminate manual synchronization (locks, DispatchQueues)
- Building offline-first apps with local storage

## Core Pattern

### Actor-Based Repository

The actor model guarantees serialized access — no data races, enforced by the compiler.

```swift
public actor LocalRepository<T: Codable & Identifiable> where T.ID == String {
    private var cache: [String: T] = [:]
    private let fileURL: URL

    public init(directory: URL = .documentsDirectory, filename: String = "data.json") {
        self.fileURL = directory.appendingPathComponent(filename)
        // Synchronous load during init (actor isolation not yet active)
        self.cache = Self.loadSynchronously(from: fileURL)
    }

    // MARK: - Public API

    public func save(_ item: T) throws {
        cache[item.id] = item
        try persistToFile()
    }

    public func delete(_ id: String) throws {
        cache[id] = nil
        try persistToFile()
    }

    public func find(by id: String) -> T? {
        cache[id]
    }

    public func loadAll() -> [T] {
        Array(cache.values)
    }

    // MARK: - Private

    private func persistToFile() throws {
        let data = try JSONEncoder().encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }

    private static func loadSynchronously(from url: URL) -> [String: T] {
        guard let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([T].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
    }
}
```

### Usage

All calls are automatically async due to actor isolation:

```swift
let repository = LocalRepository<Question>()

// Read — fast O(1) lookup from in-memory cache
let question = await repository.find(by: "q-001")
let allQuestions = await repository.loadAll()

// Write — updates cache and persists to file atomically
try await repository.save(newQuestion)
try await repository.delete("q-001")
```

### Combining with @Observable ViewModel

```swift
@Observable
final class QuestionListViewModel {
    private(set) var questions: [Question] = []
    private let repository: LocalRepository<Question>

    init(repository: LocalRepository<Question> = LocalRepository()) {
        self.repository = repository
    }

    func load() async {
        questions = await repository.loadAll()
    }

    func add(_ question: Question) async throws {
        try await repository.save(question)
        questions = await repository.loadAll()
    }
}
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Actor (not class + lock) | Compiler-enforced thread safety, no manual synchronization |
| In-memory cache + file persistence | Fast reads from cache, durable writes to disk |
| Synchronous init loading | Avoids async initialization complexity |
| Dictionary keyed by ID | O(1) lookups by identifier |
| Generic over `Codable & Identifiable` | Reusable across any model type |
| Atomic file writes (`.atomic`) | Prevents partial writes on crash |

## Best Practices

- **Use `Sendable` types** for all data crossing actor boundaries
- **Keep the actor's public API minimal** — only expose domain operations, not persistence details
- **Use `.atomic` writes** to prevent data corruption if the app crashes mid-write
- **Load synchronously in `init`** — async initializers add complexity with minimal benefit for local files
- **Combine with `@Observable`** ViewModels for reactive UI updates

## Anti-Patterns to Avoid

- Using `DispatchQueue` or `NSLock` instead of actors for new Swift concurrency code
- Exposing the internal cache dictionary to external callers
- Making the file URL configurable without validation
- Forgetting that all actor method calls are `await` — callers must handle async context
- Using `nonisolated` to bypass actor isolation (defeats the purpose)

## When to Use

- Local data storage in iOS/macOS apps (user data, settings, cached content)
- Offline-first architectures that sync to a server later
- Any shared mutable state that multiple parts of the app access concurrently
- Replacing legacy `DispatchQueue`-based thread safety with modern Swift concurrency

## Open-Source Benchmarks

Reference projects for `swift-actor-persistence` optimization:

- [apple/swift](https://github.com/apple/swift) - Language concurrency and memory model reference.
- [pointfreeco/swift-composable-architecture](https://github.com/pointfreeco/swift-composable-architecture) - State management and testable architecture patterns.

### Optimization Guidance
- Codify actor isolation and Sendable boundaries.
- Document deterministic async testing strategies.
- Prefer protocol-driven abstractions for dependency injection.

## Acceptance Criteria

- Inputs: Clear task scope, target files/systems, and explicit constraints.
- Outputs: Concrete artifact (code/doc/config/decision) aligned with this skill domain.
- Validation: At least one executable check or deterministic review step is defined and run.
- Done: Result is actionable, non-contradictory with adjacent skills, and mapped to user intent.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `swift`

