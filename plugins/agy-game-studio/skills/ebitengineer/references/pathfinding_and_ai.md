# Pathfinding & Enemy AI Reference (A* Grid & Steering Behaviors)

This module covers A* (A-Star) grid pathfinding, Steering Behaviors (Seek/Arrive), and AI Decision State Machines for Ebitengine games across top-down, tactics, tower defense, isometric, and action genres.

---

## 1. A* (A-Star) Grid Pathfinding

A* calculates the shortest path on a tile grid using heuristic distance ($f = g + h$) and fails fast with rich errors if the grid or coordinates are invalid:

```go
package ai

import (
	"fmt"
	"math"
)

type Node struct {
	X, Y   int
	G, H   float64 // G = cost from start, H = heuristic to goal
	F      float64 // F = G + H
	Parent *Node
}

func HeuristicManhattan(x1, y1, x2, y2 int) float64 {
	return math.Abs(float64(x1-x2)) + math.Abs(float64(y1-y2))
}

// FindPathAStar computes a 4-directional path from (startX, startY) to (goalX, goalY) on a blocked-cell grid.
// Returns (nil, nil) if both endpoints are valid but no walkable path exists, or a rich error on invalid inputs.
func FindPathAStar(grid [][]bool, startX, startY, goalX, goalY int) ([][2]int, error) {
	height := len(grid)
	if height == 0 || len(grid[0]) == 0 {
		return nil, fmt.Errorf("ai: pathfinding grid must have non-zero dimensions")
	}
	width := len(grid[0])

	if startX < 0 || startX >= width || startY < 0 || startY >= height {
		return nil, fmt.Errorf("ai: start coordinates (%d, %d) out of grid bounds (%dx%d)", startX, startY, width, height)
	}
	if goalX < 0 || goalX >= width || goalY < 0 || goalY >= height {
		return nil, fmt.Errorf("ai: goal coordinates (%d, %d) out of grid bounds (%dx%d)", goalX, goalY, width, height)
	}
	if grid[startY][startX] {
		return nil, fmt.Errorf("ai: start cell (%d, %d) is blocked", startX, startY)
	}
	if grid[goalY][goalX] {
		return nil, fmt.Errorf("ai: goal cell (%d, %d) is blocked", goalX, goalY)
	}

	h0 := HeuristicManhattan(startX, startY, goalX, goalY)
	openSet := []*Node{{X: startX, Y: startY, G: 0, H: h0, F: h0}}
	closedSet := make(map[int]bool, width*height/4)

	dirs := [4][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}}

	for len(openSet) > 0 {
		bestIdx := 0
		for i := 1; i < len(openSet); i++ {
			if openSet[i].F < openSet[bestIdx].F {
				bestIdx = i
			}
		}

		current := openSet[bestIdx]

		if current.X == goalX && current.Y == goalY {
			var path [][2]int
			for curr := current; curr != nil; curr = curr.Parent {
				path = append(path, [2]int{curr.X, curr.Y})
			}
			// Reverse path in-place to avoid quadratic prepend allocations
			for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
				path[i], path[j] = path[j], path[i]
			}
			return path, nil
		}

		openSet = append(openSet[:bestIdx], openSet[bestIdx+1:]...)
		closedSet[current.Y*width+current.X] = true

		for _, d := range dirs {
			nx, ny := current.X+d[0], current.Y+d[1]
			if nx < 0 || nx >= width || ny < 0 || ny >= height || grid[ny][nx] {
				continue
			}

			nKey := ny*width + nx
			if closedSet[nKey] {
				continue
			}

			gScore := current.G + 1.0

			var neighbor *Node
			for _, node := range openSet {
				if node.X == nx && node.Y == ny {
					neighbor = node
					break
				}
			}

			if neighbor == nil {
				h := HeuristicManhattan(nx, ny, goalX, goalY)
				openSet = append(openSet, &Node{
					X:      nx,
					Y:      ny,
					G:      gScore,
					H:      h,
					F:      gScore + h,
					Parent: current,
				})
			} else if gScore < neighbor.G {
				neighbor.G = gScore
				neighbor.F = neighbor.G + neighbor.H
				neighbor.Parent = current
			}
		}
	}

	return nil, nil // Unreachable goal
}
```

---

## 2. Steering Behaviors (Seek & Arrive)

Steering behaviors calculate smooth continuous acceleration vectors:

```go
func Seek(posX, posY, targetX, targetY, currentVX, currentVY, maxSpeed float64) (float64, float64, error) {
	if maxSpeed <= 0 {
		return 0, 0, fmt.Errorf("ai: Seek maxSpeed must be > 0, got %f", maxSpeed)
	}
	dx := targetX - posX
	dy := targetY - posY
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		return 0, 0, nil
	}

	desiredVX := (dx / dist) * maxSpeed
	desiredVY := (dy / dist) * maxSpeed
	return desiredVX - currentVX, desiredVY - currentVY, nil
}

func Arrive(posX, posY, targetX, targetY, currentVX, currentVY, maxSpeed, slowRadius float64) (float64, float64, error) {
	if maxSpeed <= 0 || slowRadius <= 0 {
		return 0, 0, fmt.Errorf("ai: Arrive maxSpeed (%f) and slowRadius (%f) must be > 0", maxSpeed, slowRadius)
	}
	dx := targetX - posX
	dy := targetY - posY
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		return 0, 0, nil
	}

	targetSpeed := maxSpeed
	if dist < slowRadius {
		targetSpeed = maxSpeed * (dist / slowRadius)
	}

	desiredVX := (dx / dist) * targetSpeed
	desiredVY := (dy / dist) * targetSpeed
	return desiredVX - currentVX, desiredVY - currentVY, nil
}
```

---

## 3. Enemy AI Decision State Machine

Model enemy states (`StatePatrol`, `StateChase`, `StateAttack`, `StateFlee`) with explicit perception range checks:

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

func (ai *EnemyAI) Update(enemyX, enemyY, playerX, playerY, hpPercent float64) (AIState, error) {
	if ai.DetectionDist <= 0 || ai.AttackDist <= 0 || ai.AttackDist > ai.DetectionDist {
		return ai.State, fmt.Errorf("ai: invalid distance thresholds (attack=%.1f, detect=%.1f)", ai.AttackDist, ai.DetectionDist)
	}

	dist := math.Hypot(playerX-enemyX, playerY-enemyY)

	if hpPercent < 0.20 {
		ai.State = StateFlee
		return ai.State, nil
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
		if hpPercent >= 0.50 {
			ai.State = StatePatrol
		}
	default:
		return ai.State, fmt.Errorf("ai: unknown AIState %d", ai.State)
	}

	return ai.State, nil
}
```
