# Pathfinding & Enemy AI Reference (A* Grid & Steering Behaviors)

This module covers A* (A-Star) grid pathfinding, Breadth-First Search (BFS), Steering Behaviors, and AI Decision State Machines for Ebitengine games.

---

## 1. A* (A-Star) Grid Pathfinding

A* calculates the shortest path on a tile grid using heuristic distance ($f = g + h$):

```go
type Node struct {
	X, Y   int
	G, H   float64 // G = cost from start, H = heuristic to goal
	F      float64 // F = G + H
	Parent *Node
}

func HeuristicManhattan(x1, y1, x2, y2 int) float64 {
	return math.Abs(float64(x1-x2)) + math.Abs(float64(y1-y2))
}

func FindPathAStar(grid [][]bool, startX, startY, goalX, goalY int) [][2]int {
	width := len(grid[0])
	height := len(grid)

	if startX < 0 || startX >= width || startY < 0 || startY >= height ||
		goalX < 0 || goalX >= width || goalY < 0 || goalY >= height {
		return nil
	}

	openSet := []*Node{{X: startX, Y: startY, G: 0, H: HeuristicManhattan(startX, startY, goalX, goalY)}}
	openSet[0].F = openSet[0].G + openSet[0].H

	closedSet := make(map[int]bool)

	dirs := [][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} // 4-directional cardinal movement

	for len(openSet) > 0 {
		// Find node with lowest F score
		bestIdx := 0
		for i := 1; i < len(openSet); i++ {
			if openSet[i].F < openSet[bestIdx].F {
				bestIdx = i
			}
		}

		current := openSet[bestIdx]

		// Reached goal? Reconstruct path
		if current.X == goalX && current.Y == goalY {
			path := [][2]int{}
			curr := current
			for curr != nil {
				path = append([][2]int{{curr.X, curr.Y}}, path...)
				curr = curr.Parent
			}
			return path
		}

		// Remove current from openSet and add to closedSet
		openSet = append(openSet[:bestIdx], openSet[bestIdx+1:]...)
		key := current.Y*width + current.X
		closedSet[key] = true

		for _, d := range dirs {
			nx, ny := current.X+d[0], current.Y+d[1]

			if nx < 0 || nx >= width || ny < 0 || ny >= height || grid[ny][nx] {
				continue // Walkable check
			}

			nKey := ny*width + nx
			if closedSet[nKey] { continue }

			gScore := current.G + 1.0

			// Check if neighbor in openSet
			var neighbor *Node
			for _, node := range openSet {
				if node.X == nx && node.Y == ny {
					neighbor = node
					break
				}
			}

			if neighbor == nil {
				neighbor = &Node{
					X: nx, Y: ny,
					G: gScore,
					H: HeuristicManhattan(nx, ny, goalX, goalY),
					Parent: current,
				}
				neighbor.F = neighbor.G + neighbor.H
				openSet = append(openSet, neighbor)
			} else if gScore < neighbor.G {
				neighbor.G = gScore
				neighbor.F = neighbor.G + neighbor.H
				neighbor.Parent = current
			}
		}
	}

	return nil // No path found
}
```

---

## 2. Steering Behaviors (Seek, Arrive, Wander)

Steering behaviors calculate smooth continuous acceleration vectors:

### 2.1 Seek & Arrive (Deceleration)

```go
func Seek(posX, posY, targetX, targetY, currentVX, currentVY, maxSpeed float64) (float64, float64) {
	dx := targetX - posX
	dy := targetY - posY
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist == 0 { return 0, 0 }

	desiredVX := (dx / dist) * maxSpeed
	desiredVY := (dy / dist) * maxSpeed

	// Steering force = Desired Velocity - Current Velocity
	return desiredVX - currentVX, desiredVY - currentVY
}

func Arrive(posX, posY, targetX, targetY, currentVX, currentVY, maxSpeed, slowRadius float64) (float64, float64) {
	dx := targetX - posX
	dy := targetY - posY
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist == 0 { return 0, 0 }

	targetSpeed := maxSpeed
	if dist < slowRadius {
		targetSpeed = maxSpeed * (dist / slowRadius) // Smooth deceleration
	}

	desiredVX := (dx / dist) * targetSpeed
	desiredVY := (dy / dist) * targetSpeed

	return desiredVX - currentVX, desiredVY - currentVY
}
```

---

## 3. Enemy AI Decision State Machine

Model enemy states (Patrol, Chase, Attack, Flee) with perception range checks:

```go
type AIState int

const (
	StatePatrol AIState = iota
	StateChase
	StateAttack
	StateFlee
)

type EnemyAI struct {
	State         AIState
	PatrolPoints  [][2]float64
	PatrolIndex   int
	DetectionDist float64
	AttackDist    float64
}

func (ai *EnemyAI) Update(enemyX, enemyY, playerX, playerY, hpPercent float64) AIState {
	dist := math.Hypot(playerX-enemyX, playerY-enemyY)

	// Flee if HP critically low (< 20%)
	if hpPercent < 0.20 {
		ai.State = StateFlee
		return ai.State
	}

	switch ai.State {
	case StatePatrol:
		if dist <= ai.DetectionDist {
			ai.State = StateChase
		}
	case StateChase:
		if dist <= ai.AttackDist {
			ai.State = StateAttack
		} else if dist > ai.DetectionDist*1.5 {
			ai.State = StatePatrol
		}
	case StateAttack:
		if dist > ai.AttackDist {
			ai.State = StateChase
		}
	case StateFlee:
		// Flee logic
	}

	return ai.State
}
```
