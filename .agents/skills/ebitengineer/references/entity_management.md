# Entity Management & Architecture Reference (Object Pools & Light ECS)

This module covers entity population architecture, memory slice pooling, deferred destruction buffers, and lightweight Entity Component Systems (ECS) in Go.

---

## 1. Slice Object Pooling vs. ECS Trade-Off

| Approach | Best For | Memory Overhead | Complexity |
| :--- | :--- | :--- | :--- |
| **Object Pool Slices (`[]*Entity`)** | Small to Medium Games ($< 1,000$ active entities) | Minimal, contiguous heap | Low |
| **Light Component Bitmask (ECS)** | Bullet Hell / Swarms ($1,000 - 50,000+$ active entities) | CPU L1/L2 Cache Friendly | Medium |

---

## 2. Slice Object Pool Pattern with Deferred Deletion

To avoid GC allocation spikes during high-frequency entity creation and destruction (projectiles, enemies, particles), use a fixed-capacity slice pool and deferred deletion buffer:

```go
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

func NewEntityManager(capacity int) *EntityManager {
	return &EntityManager{
		pool:      make([]Entity, capacity),
		toDestroy: make([]int, 0, 64),
	}
}

func (em *EntityManager) Spawn(x, y float64, entityType string) *Entity {
	// Re-use inactive slot in pool
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
			return e
		}
	}
	return nil // Pool full
}

func (em *EntityManager) MarkForDestruction(id int) {
	em.toDestroy = append(em.toDestroy, id)
}

func (em *EntityManager) FlushDestructions() {
	if len(em.toDestroy) == 0 { return }

	for _, id := range em.toDestroy {
		for i := range em.pool {
			if em.pool[i].Active && em.pool[i].ID == id {
				em.pool[i].Active = false
				break
			}
		}
	}
	em.toDestroy = em.toDestroy[:0] // Reset buffer without allocation
}
```

---

## 3. Light Bitmask Component ECS Pattern

When managing thousands of bullet hell projectiles or swarm units, store component data in parallel flat arrays indexed by Entity ID:

```go
type ComponentMask uint32

const (
	CompTransform ComponentMask = 1 << iota
	CompVelocity
	CompRender
	CompCollider
)

type LightWorld struct {
	Masks      []ComponentMask
	X, Y       []float64 // Transform
	VX, VY     []float64 // Velocity
	Width, H   []float64 // Collider
	Active     []bool
	Capacity   int
}

func NewLightWorld(capacity int) *LightWorld {
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
	}
}

// System Update: CPU L1/L2 cache-friendly iteration
func (w *LightWorld) UpdateMovement(dt float64) {
	req := CompTransform | CompVelocity
	for i := 0; i < w.Capacity; i++ {
		if w.Active[i] && (w.Masks[i]&req) == req {
			w.X[i] += w.VX[i] * dt
			w.Y[i] += w.VY[i] * dt
		}
	}
}
```
