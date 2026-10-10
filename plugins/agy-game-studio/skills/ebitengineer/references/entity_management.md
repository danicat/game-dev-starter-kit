# Entity Management & Architecture Reference (Object Pools & Light ECS)

This module covers entity population architecture, pre-allocated slice pooling, deferred destruction buffers, and lightweight Entity Component Systems (ECS) in Go with fail-fast capacity and ID checks.

---

## 1. Slice Object Pooling vs. ECS Trade-Off

| Approach | Best For | Memory Overhead | Complexity |
| :--- | :--- | :--- | :--- |
| **Object Pool Slices (`[]Entity`)** | Small to Medium 2D Games ($< 1,000$ active entities) | Minimal, contiguous heap | Low |
| **Light Component Bitmask (ECS)** | Shmups / Bullet Hell / Swarms ($1,000 - 50,000+$ active entities) | CPU L1/L2 Cache Friendly | Medium |

---

## 2. Slice Object Pool Pattern with Deferred Deletion

To prevent GC allocation spikes during high-frequency entity creation and destruction (projectiles, enemies, tactical units, puzzle blocks), allocate a fixed-capacity slice pool at boot and fail fast with rich error context if capacity is exceeded:

```go
package entity

import "fmt"

type Entity struct {
	ID     int
	Active bool
	X, Y   float64
	VX, VY float64
	Type   string
}

type EntityManager struct {
	pool      []Entity
	nextID    int
	toDestroy []int
}

func NewEntityManager(capacity int) (*EntityManager, error) {
	if capacity <= 0 {
		return nil, fmt.Errorf("entity: pool capacity must be > 0, got %d", capacity)
	}
	return &EntityManager{
		pool:      make([]Entity, capacity),
		nextID:    1,
		toDestroy: make([]int, 0, 64),
	}, nil
}

// Spawn activates an idle slot in the pool or fails fast with a rich error if capacity is exhausted.
func (em *EntityManager) Spawn(x, y float64, entityType string) (*Entity, error) {
	if entityType == "" {
		return nil, fmt.Errorf("entity: entityType must not be empty")
	}
	for i := range em.pool {
		if !em.pool[i].Active {
			e := &em.pool[i]
			e.ID = em.nextID
			em.nextID++
			e.Active = true
			e.X = x
			e.Y = y
			e.VX = 0
			e.VY = 0
			e.Type = entityType
			return e, nil
		}
	}
	return nil, fmt.Errorf("entity: pool exhausted (capacity=%d) while spawning %q at (%.1f, %.1f)", len(em.pool), entityType, x, y)
}

func (em *EntityManager) MarkForDestruction(id int) {
	em.toDestroy = append(em.toDestroy, id)
}

func (em *EntityManager) FlushDestructions() error {
	if len(em.toDestroy) == 0 {
		return nil
	}

	for _, id := range em.toDestroy {
		found := false
		for i := range em.pool {
			if em.pool[i].Active && em.pool[i].ID == id {
				em.pool[i].Active = false
				found = true
				break
			}
		}
		if !found {
			em.toDestroy = em.toDestroy[:0]
			return fmt.Errorf("entity: cannot destroy unknown or inactive entity ID %d", id)
		}
	}
	em.toDestroy = em.toDestroy[:0] // Reset buffer without heap allocation
	return nil
}
```

---

## 3. Light Bitmask Component ECS Pattern

When managing thousands of bullet hell projectiles or swarm units, store component data in parallel Structure-of-Arrays (SoA) slices indexed by entity slot:

```go
type ComponentMask uint32

const (
	CompTransform ComponentMask = 1 << iota
	CompVelocity
	CompRender
	CompCollider
)

type LightWorld struct {
	Masks    []ComponentMask
	X, Y     []float64 // Transform
	VX, VY   []float64 // Velocity
	Width, H []float64 // Collider
	Active   []bool
	Capacity int
}

func NewLightWorld(capacity int) (*LightWorld, error) {
	if capacity <= 0 {
		return nil, fmt.Errorf("entity: LightWorld capacity must be > 0, got %d", capacity)
	}
	return &LightWorld{
		Masks:    make([]ComponentMask, capacity),
		X:        make([]float64, capacity),
		Y:        make([]float64, capacity),
		VX:       make([]float64, capacity),
		VY:       make([]float64, capacity),
		Width:    make([]float64, capacity),
		H:        make([]float64, capacity),
		Active:   make([]bool, capacity),
		Capacity: capacity,
	}, nil
}

// UpdateMovement performs CPU L1/L2 cache-friendly linear iteration.
func (w *LightWorld) UpdateMovement(dt float64) {
	const req = CompTransform | CompVelocity
	for i := 0; i < w.Capacity; i++ {
		if w.Active[i] && (w.Masks[i]&req) == req {
			w.X[i] += w.VX[i] * dt
			w.Y[i] += w.VY[i] * dt
		}
	}
}
```
