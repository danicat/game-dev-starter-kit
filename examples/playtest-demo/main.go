package main

import (
	"encoding/binary"
	"fmt"
	"image/color"
	"log"
	"math"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/audio"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"github.com/hajimehoshi/ebiten/v2/vector"
)

const (
	screenW    = 640
	screenH    = 360
	dt         = 1.0 / 60.0
	sampleRate = 44100
)

type EnemyKind int

const (
	EnemyDrone EnemyKind = iota
	EnemyDasher
	EnemyTank
)

type Star struct {
	X, Y  float32
	Speed float32
	Size  float32
	Alpha uint8
}

type Bullet struct {
	X, Y   float64
	VX, VY float64
	Radius float32
	Life   float64
	Color  color.RGBA
}

type Enemy struct {
	Kind      EnemyKind
	X, Y      float64
	VX, VY    float64
	Radius    float32
	HP        int
	MaxHP     int
	Speed     float64
	HitFlash  float64
	DashTimer float64
	Angle     float64
}

type Gem struct {
	X, Y   float64
	VX, VY float64
	Value  int
	Pulse  float64
}

type Particle struct {
	X, Y    float64
	VX, VY  float64
	Life    float64
	MaxLife float64
	Size    float32
	Color   color.RGBA
}

type FloatingText struct {
	X, Y  float64
	VY    float64
	Text  string
	Life  float64
	Color color.RGBA
}

type SoundBank struct {
	ctx        *audio.Context
	sfxShoot   []byte
	sfxHit     []byte
	sfxExplode []byte
	sfxGem     []byte
	sfxLevelUp []byte
	sfxHurt    []byte
}

func newSoundBank() *SoundBank {
	ctx := audio.CurrentContext()
	if ctx == nil {
		ctx = audio.NewContext(sampleRate)
	}
	return &SoundBank{
		ctx:        ctx,
		sfxShoot:   synthTone(880, 260, 0.07, 0.22, false),
		sfxHit:     synthTone(420, 180, 0.05, 0.20, true),
		sfxExplode: synthTone(190, 45, 0.22, 0.32, true),
		sfxGem:     synthArp([]float64{587.33, 880.0}, 0.08, 0.20),
		sfxLevelUp: synthArp([]float64{523.25, 659.25, 783.99, 1046.50}, 0.28, 0.26),
		sfxHurt:    synthTone(160, 70, 0.25, 0.35, true),
	}
}

func (s *SoundBank) play(pcm []byte) {
	if s == nil || s.ctx == nil || len(pcm) == 0 {
		return
	}
	p := s.ctx.NewPlayerFromBytes(pcm)
	p.Play()
}

func synthTone(startFreq, endFreq, durationSec, volume float64, addNoise bool) []byte {
	numSamples := int(durationSec * sampleRate)
	buf := make([]byte, numSamples*4)
	var phase float64
	rng := rand.New(rand.NewSource(42))
	for i := 0; i < numSamples; i++ {
		t := float64(i) / float64(numSamples)
		freq := startFreq + (endFreq-startFreq)*t
		phase += 2 * math.Pi * freq / sampleRate
		env := (1.0 - t) * (1.0 - t)
		sig := math.Sin(phase)
		if sig >= 0 {
			sig = 0.7 * sig + 0.3
		} else {
			sig = 0.7 * sig - 0.3
		}
		if addNoise {
			sig = 0.55*sig + 0.45*(rng.Float64()*2-1)
		}
		sample := int16(sig * env * volume * 32767)
		u := uint16(sample)
		binary.LittleEndian.PutUint16(buf[i*4:], u)
		binary.LittleEndian.PutUint16(buf[i*4+2:], u)
	}
	return buf
}

func synthArp(freqs []float64, durationSec, volume float64) []byte {
	numSamples := int(durationSec * sampleRate)
	buf := make([]byte, numSamples*4)
	if len(freqs) == 0 {
		return buf
	}
	var phase float64
	stepLen := numSamples / len(freqs)
	if stepLen < 1 {
		stepLen = 1
	}
	for i := 0; i < numSamples; i++ {
		idx := i / stepLen
		if idx >= len(freqs) {
			idx = len(freqs) - 1
		}
		t := float64(i) / float64(numSamples)
		env := 1.0 - t*0.85
		phase += 2 * math.Pi * freqs[idx] / sampleRate
		sig := math.Sin(phase)*0.75 + math.Sin(phase*2)*0.25
		sample := int16(sig * env * volume * 32767)
		u := uint16(sample)
		binary.LittleEndian.PutUint16(buf[i*4:], u)
		binary.LittleEndian.PutUint16(buf[i*4+2:], u)
	}
	return buf
}

type Game struct {
	rng   *rand.Rand
	sfx   *SoundBank
	stars []Star

	tick     int
	gameOver bool

	// Player state
	playerX       float64
	playerY       float64
	playerVX      float64
	playerVY      float64
	aimAngle      float64
	lastMouseX    int
	lastMouseY    int
	useMouseAim   bool
	hp            int
	maxHP         int
	invulnTimer   float64
	fireCooldown  float64
	dashCooldown  float64
	dashActive    float64
	score         int
	kills         int
	wave          int
	waveTimer     float64
	spawnTimer    float64
	xp            int
	xpNext        int
	level         int
	shakeTimer    float64
	shakeStrength float64

	bullets   []Bullet
	enemies   []Enemy
	gems      []Gem
	particles []Particle
	popups    []FloatingText
}

func NewGame() *Game {
	rng := rand.New(rand.NewSource(1337))
	stars := make([]Star, 55)
	for i := range stars {
		stars[i] = Star{
			X:     rng.Float32() * screenW,
			Y:     rng.Float32() * screenH,
			Speed: 12 + rng.Float32()*38,
			Size:  1 + rng.Float32()*1.6,
			Alpha: uint8(70 + rng.Intn(140)),
		}
	}

	g := &Game{
		rng:   rng,
		sfx:   newSoundBank(),
		stars: stars,
	}
	g.resetSession()
	return g
}

func (g *Game) resetSession() {
	g.tick = 0
	g.gameOver = false
	g.playerX = screenW / 2
	g.playerY = screenH / 2
	g.playerVX = 0
	g.playerVY = 0
	g.aimAngle = 0
	g.hp = 5
	g.maxHP = 5
	g.invulnTimer = 0
	g.fireCooldown = 0
	g.dashCooldown = 0
	g.dashActive = 0
	g.score = 0
	g.kills = 0
	g.wave = 1
	g.waveTimer = 0
	g.spawnTimer = 0.6
	g.xp = 0
	g.xpNext = 6
	g.level = 1
	g.shakeTimer = 0
	g.shakeStrength = 0

	g.bullets = g.bullets[:0]
	g.enemies = g.enemies[:0]
	g.gems = g.gems[:0]
	g.particles = g.particles[:0]
	g.popups = g.popups[:0]

	// Spawn initial wave of enemies around the perimeter so the arena is immediately active
	g.spawnWaveCluster(4)
	g.addPopup(screenW/2-40, screenH/2-44, "WAVE 1 START!", color.RGBA{56, 189, 248, 255})
	fmt.Printf("[NeonBastion] Session started: Wave 1, Player HP=%d/%d\n", g.hp, g.maxHP)
}

func (g *Game) Update() error {
	g.tick++

	// Update starfield parallax
	for i := range g.stars {
		s := &g.stars[i]
		s.X -= s.Speed * float32(dt) * 0.4
		if s.X < 0 {
			s.X += screenW
			s.Y = g.rng.Float32() * screenH
		}
	}

	if g.shakeTimer > 0 {
		g.shakeTimer = math.Max(0, g.shakeTimer-dt)
	}

	if g.gameOver {
		g.updateParticles()
		g.updatePopups()
		if inpututil.IsKeyJustPressed(ebiten.KeyR) ||
			inpututil.IsKeyJustPressed(ebiten.KeyEnter) ||
			inpututil.IsKeyJustPressed(ebiten.KeySpace) {
			g.resetSession()
		}
		return nil
	}

	// 1. Player Movement Input (WASD / Arrow Keys)
	var moveX, moveY float64
	if ebiten.IsKeyPressed(ebiten.KeyA) || ebiten.IsKeyPressed(ebiten.KeyArrowLeft) {
		moveX -= 1
	}
	if ebiten.IsKeyPressed(ebiten.KeyD) || ebiten.IsKeyPressed(ebiten.KeyArrowRight) {
		moveX += 1
	}
	if ebiten.IsKeyPressed(ebiten.KeyW) || ebiten.IsKeyPressed(ebiten.KeyArrowUp) {
		moveY -= 1
	}
	if ebiten.IsKeyPressed(ebiten.KeyS) || ebiten.IsKeyPressed(ebiten.KeyArrowDown) {
		moveY += 1
	}
	if moveX != 0 && moveY != 0 {
		inv := 1.0 / math.Sqrt2
		moveX *= inv
		moveY *= inv
	}

	// Track mouse movement vs keyboard directional aiming
	mx, my := ebiten.CursorPosition()
	if mx != g.lastMouseX || my != g.lastMouseY {
		g.lastMouseX = mx
		g.lastMouseY = my
		if mx >= 0 && mx <= screenW && my >= 0 && my <= screenH {
			g.useMouseAim = true
		}
	}
	if g.useMouseAim {
		g.aimAngle = math.Atan2(float64(my)-g.playerY, float64(mx)-g.playerX)
	} else if moveX != 0 || moveY != 0 {
		g.aimAngle = math.Atan2(moveY, moveX)
	} else if nearest := g.findNearestEnemy(); nearest != nil {
		// Auto-lock turret onto nearest enemy when using keyboard-only controls!
		g.aimAngle = math.Atan2(nearest.Y-g.playerY, nearest.X-g.playerX)
	}

	// 2. Hyper-Dash (X or Shift)
	if g.dashCooldown > 0 {
		g.dashCooldown = math.Max(0, g.dashCooldown-dt)
	}
	if g.dashActive > 0 {
		g.dashActive = math.Max(0, g.dashActive-dt)
	}
	if (inpututil.IsKeyJustPressed(ebiten.KeyX) || inpututil.IsKeyJustPressed(ebiten.KeyShiftLeft)) && g.dashCooldown <= 0 {
		dashAngle := g.aimAngle
		if moveX != 0 || moveY != 0 {
			dashAngle = math.Atan2(moveY, moveX)
		}
		g.playerVX = math.Cos(dashAngle) * 440
		g.playerVY = math.Sin(dashAngle) * 440
		g.dashActive = 0.16
		g.dashCooldown = 1.1
		g.invulnTimer = math.Max(g.invulnTimer, 0.22)
		g.spawnBurst(g.playerX, g.playerY, 10, color.RGBA{56, 189, 248, 255}, 120)
	}

	baseSpeed := 185.0
	if g.dashActive <= 0 {
		g.playerVX = moveX * baseSpeed
		g.playerVY = moveY * baseSpeed
	} else if g.tick%2 == 0 {
		g.particles = append(g.particles, Particle{
			X: g.playerX, Y: g.playerY,
			Life: 0.22, MaxLife: 0.22, Size: 8,
			Color: color.RGBA{56, 189, 248, 180},
		})
	}

	g.playerX = math.Max(18, math.Min(screenW-18, g.playerX+g.playerVX*dt))
	g.playerY = math.Max(42, math.Min(screenH-24, g.playerY+g.playerVY*dt))

	// Thruster exhaust particles when moving
	if (moveX != 0 || moveY != 0) && g.tick%3 == 0 {
		g.particles = append(g.particles, Particle{
			X:       g.playerX - moveX*10 + (g.rng.Float64()*6 - 3),
			Y:       g.playerY - moveY*10 + (g.rng.Float64()*6 - 3),
			VX:      -moveX*55 + (g.rng.Float64()*20 - 10),
			VY:      -moveY*55 + (g.rng.Float64()*20 - 10),
			Life:    0.20,
			MaxLife: 0.20,
			Size:    3.2,
			Color:   color.RGBA{56, 189, 248, 220},
		})
	}

	if g.invulnTimer > 0 {
		g.invulnTimer = math.Max(0, g.invulnTimer-dt)
	}

	// 3. Weapon Firing (Space, Z, or Left Mouse Button)
	if g.fireCooldown > 0 {
		g.fireCooldown = math.Max(0, g.fireCooldown-dt)
	}
	wantsFire := ebiten.IsKeyPressed(ebiten.KeySpace) ||
		ebiten.IsKeyPressed(ebiten.KeyZ) ||
		ebiten.IsMouseButtonPressed(ebiten.MouseButtonLeft)

	if wantsFire && g.fireCooldown <= 0 {
		g.fireWeapon()
	}

	// 4. Wave & Enemy Spawner
	g.waveTimer += dt
	if g.waveTimer >= 18.0 {
		g.waveTimer = 0
		g.wave++
		g.spawnWaveCluster(3 + g.wave)
		g.addPopup(screenW/2-36, 68, fmt.Sprintf("WAVE %d!", g.wave), color.RGBA{250, 204, 21, 255})
		fmt.Printf("[NeonBastion] Wave %d started! Score=%d Level=%d\n", g.wave, g.score, g.level)
	}

	g.spawnTimer -= dt
	if g.spawnTimer <= 0 {
		interval := math.Max(0.55, 1.75-float64(g.wave)*0.14)
		g.spawnTimer = interval
		if len(g.enemies) < 26 {
			g.spawnSingleEnemy()
		}
	}

	// 5. Update Bullets
	aliveBullets := g.bullets[:0]
	for _, b := range g.bullets {
		b.X += b.VX * dt
		b.Y += b.VY * dt
		b.Life -= dt
		if b.Life > 0 && b.X >= -10 && b.X <= screenW+10 && b.Y >= 28 && b.Y <= screenH+10 {
			aliveBullets = append(aliveBullets, b)
		}
	}
	g.bullets = aliveBullets

	// 6. Update Enemies & Resolve Bullet / Player Collisions
	aliveEnemies := g.enemies[:0]
	for i := range g.enemies {
		e := g.enemies[i]
		if e.HitFlash > 0 {
			e.HitFlash = math.Max(0, e.HitFlash-dt)
		}

		dx := g.playerX - e.X
		dy := g.playerY - e.Y
		dist := math.Hypot(dx, dy)
		if dist < 0.001 {
			dist = 0.001
		}
		dirX := dx / dist
		dirY := dy / dist
		e.Angle = math.Atan2(dirY, dirX)

		switch e.Kind {
		case EnemyDrone:
			e.VX = dirX * e.Speed
			e.VY = dirY * e.Speed
		case EnemyDasher:
			e.DashTimer += dt
			speedMult := 1.0
			if math.Mod(e.DashTimer, 2.2) > 1.5 {
				speedMult = 2.15
			}
			e.VX = dirX * e.Speed * speedMult
			e.VY = dirY * e.Speed * speedMult
		case EnemyTank:
			e.VX = dirX * e.Speed
			e.VY = dirY * e.Speed
		}

		e.X += e.VX * dt
		e.Y += e.VY * dt

		// Check bullet hits against enemy
		killed := false
		remBullets := g.bullets[:0]
		for _, b := range g.bullets {
			if !killed && math.Hypot(b.X-e.X, b.Y-e.Y) <= float64(e.Radius+b.Radius) {
				e.HP--
				e.HitFlash = 0.10
				g.spawnBurst(b.X, b.Y, 4, b.Color, 85)
				if e.HP <= 0 {
					killed = true
					g.handleEnemyKilled(e)
				} else {
					g.sfx.play(g.sfx.sfxHit)
				}
				continue
			}
			remBullets = append(remBullets, b)
		}
		g.bullets = remBullets

		if killed {
			continue
		}

		// Check collision with Player
		if g.invulnTimer <= 0 && math.Hypot(g.playerX-e.X, g.playerY-e.Y) <= float64(e.Radius+11) {
			g.damagePlayer(e)
			if e.Kind != EnemyTank {
				continue
			}
		}

		aliveEnemies = append(aliveEnemies, e)
	}
	g.enemies = aliveEnemies

	// 7. Update XP Gems (Magnetize + Collect)
	aliveGems := g.gems[:0]
	for _, gem := range g.gems {
		gem.Pulse += dt * 6
		dx := g.playerX - gem.X
		dy := g.playerY - gem.Y
		dist := math.Hypot(dx, dy)
		magnetRadius := 95.0 + float64(g.level)*12.0
		if dist < magnetRadius && dist > 0.01 {
			pull := 260.0 * (1.0 - dist/magnetRadius*0.5)
			gem.VX = (dx / dist) * pull
			gem.VY = (dy / dist) * pull
		} else {
			gem.VX *= 0.92
			gem.VY *= 0.92
		}
		gem.X += gem.VX * dt
		gem.Y += gem.VY * dt

		if dist <= 18.0 {
			g.collectGem(gem)
			continue
		}
		aliveGems = append(aliveGems, gem)
	}
	g.gems = aliveGems

	g.updateParticles()
	g.updatePopups()

	return nil
}

func (g *Game) findNearestEnemy() *Enemy {
	var best *Enemy
	bestDist := math.MaxFloat64
	for i := range g.enemies {
		e := &g.enemies[i]
		d := math.Hypot(e.X-g.playerX, e.Y-g.playerY)
		if d < bestDist {
			bestDist = d
			best = e
		}
	}
	return best
}

func (g *Game) fireWeapon() {
	bulletSpeed := 430.0
	baseCooldown := math.Max(0.09, 0.20-float64(g.level-1)*0.022)
	g.fireCooldown = baseCooldown

	col := color.RGBA{56, 189, 248, 255}
	if g.level >= 3 {
		col = color.RGBA{250, 204, 21, 255}
	}

	spawnBullet := func(angle, offsetLateral float64) {
		perpX := -math.Sin(angle) * offsetLateral
		perpY := math.Cos(angle) * offsetLateral
		bx := g.playerX + math.Cos(angle)*14 + perpX
		by := g.playerY + math.Sin(angle)*14 + perpY
		g.bullets = append(g.bullets, Bullet{
			X:      bx,
			Y:      by,
			VX:     math.Cos(angle) * bulletSpeed,
			VY:     math.Sin(angle) * bulletSpeed,
			Radius: 4.0,
			Life:   1.35,
			Color:  col,
		})
	}

	switch {
	case g.level == 1:
		spawnBullet(g.aimAngle, 0)
	case g.level == 2:
		spawnBullet(g.aimAngle, -5)
		spawnBullet(g.aimAngle, 5)
	case g.level == 3:
		spawnBullet(g.aimAngle, 0)
		spawnBullet(g.aimAngle-0.16, 0)
		spawnBullet(g.aimAngle+0.16, 0)
	default:
		spawnBullet(g.aimAngle, -4)
		spawnBullet(g.aimAngle, 4)
		spawnBullet(g.aimAngle-0.22, 0)
		spawnBullet(g.aimAngle+0.22, 0)
	}

	g.sfx.play(g.sfx.sfxShoot)
}

func (g *Game) spawnWaveCluster(count int) {
	for i := 0; i < count; i++ {
		g.spawnSingleEnemy()
	}
}

func (g *Game) spawnSingleEnemy() {
	// Pick a point along the arena perimeter away from the player
	var x, y float64
	for attempt := 0; attempt < 8; attempt++ {
		side := g.rng.Intn(4)
		switch side {
		case 0:
			x = 20 + g.rng.Float64()*(screenW-40)
			y = 46
		case 1:
			x = 20 + g.rng.Float64()*(screenW-40)
			y = screenH - 22
		case 2:
			x = 22
			y = 46 + g.rng.Float64()*(screenH-68)
		default:
			x = screenW - 22
			y = 46 + g.rng.Float64()*(screenH-68)
		}
		if math.Hypot(x-g.playerX, y-g.playerY) > 130 {
			break
		}
	}

	roll := g.rng.Float64()
	kind := EnemyDrone
	hp := 1
	radius := float32(11)
	speed := 72.0 + float64(g.wave)*6.0

	if g.wave >= 2 && roll > 0.80 {
		kind = EnemyTank
		hp = 4 + g.wave/2
		radius = 17
		speed = 44.0 + float64(g.wave)*3.0
	} else if roll > 0.52 {
		kind = EnemyDasher
		hp = 2
		radius = 12
		speed = 64.0 + float64(g.wave)*5.0
	}

	g.enemies = append(g.enemies, Enemy{
		Kind:   kind,
		X:      x,
		Y:      y,
		Radius: radius,
		HP:     hp,
		MaxHP:  hp,
		Speed:  speed,
	})
}

func (g *Game) handleEnemyKilled(e Enemy) {
	g.kills++
	pts := 100
	gemCount := 1
	col := color.RGBA{244, 63, 94, 255}

	switch e.Kind {
	case EnemyDasher:
		pts = 150
		gemCount = 2
		col = color.RGBA{245, 158, 11, 255}
	case EnemyTank:
		pts = 350
		gemCount = 4
		col = color.RGBA{168, 85, 247, 255}
		g.triggerShake(0.18, 4.5)
	}

	g.score += pts
	g.sfx.play(g.sfx.sfxExplode)
	g.spawnBurst(e.X, e.Y, 14, col, 145)
	g.addPopup(e.X-14, e.Y-10, fmt.Sprintf("+%d", pts), col)

	for i := 0; i < gemCount; i++ {
		ang := g.rng.Float64() * 2 * math.Pi
		spd := 25 + g.rng.Float64()*55
		g.gems = append(g.gems, Gem{
			X:     e.X,
			Y:     e.Y,
			VX:    math.Cos(ang) * spd,
			VY:    math.Sin(ang) * spd,
			Value: 1,
		})
	}
}

func (g *Game) collectGem(gem Gem) {
	g.xp += gem.Value
	g.score += 25
	g.sfx.play(g.sfx.sfxGem)

	if g.xp >= g.xpNext {
		g.xp -= g.xpNext
		g.level++
		g.xpNext = 6 + g.level*4
		if g.hp < g.maxHP {
			g.hp++
		}
		g.sfx.play(g.sfx.sfxLevelUp)
		g.triggerShake(0.20, 3.5)
		g.spawnBurst(g.playerX, g.playerY, 22, color.RGBA{34, 197, 94, 255}, 170)
		g.addPopup(g.playerX-32, g.playerY-24, fmt.Sprintf("LEVEL %d UP!", g.level), color.RGBA{34, 197, 94, 255})
		fmt.Printf("[NeonBastion] Player reached Level %d! HP=%d/%d Score=%d\n", g.level, g.hp, g.maxHP, g.score)
	}
}

func (g *Game) damagePlayer(e Enemy) {
	g.hp--
	g.invulnTimer = 1.05
	g.sfx.play(g.sfx.sfxHurt)
	g.triggerShake(0.28, 6.5)
	g.spawnBurst(g.playerX, g.playerY, 18, color.RGBA{239, 68, 68, 255}, 160)
	g.addPopup(g.playerX-22, g.playerY-20, "-1 SHIELD!", color.RGBA{239, 68, 68, 255})
	fmt.Printf("[NeonBastion] Player hit by enemy kind=%d at (%.1f, %.1f)! Remaining HP=%d/%d\n", e.Kind, g.playerX, g.playerY, g.hp, g.maxHP)

	if g.hp <= 0 {
		g.hp = 0
		g.gameOver = true
		fmt.Printf("[NeonBastion] GAME OVER at Wave %d! Final Score=%d Kills=%d\n", g.wave, g.score, g.kills)
	}
}

func (g *Game) triggerShake(duration, strength float64) {
	if duration > g.shakeTimer {
		g.shakeTimer = duration
	}
	if strength > g.shakeStrength {
		g.shakeStrength = strength
	}
}

func (g *Game) spawnBurst(x, y float64, count int, col color.RGBA, maxSpeed float64) {
	for i := 0; i < count; i++ {
		ang := g.rng.Float64() * 2 * math.Pi
		spd := (0.25 + g.rng.Float64()*0.75) * maxSpeed
		life := 0.22 + g.rng.Float64()*0.28
		g.particles = append(g.particles, Particle{
			X:       x,
			Y:       y,
			VX:      math.Cos(ang) * spd,
			VY:      math.Sin(ang) * spd,
			Life:    life,
			MaxLife: life,
			Size:    2.0 + g.rng.Float32()*2.5,
			Color:   col,
		})
	}
}

func (g *Game) addPopup(x, y float64, text string, col color.RGBA) {
	g.popups = append(g.popups, FloatingText{
		X:     x,
		Y:     y,
		VY:    -32,
		Text:  text,
		Life:  0.85,
		Color: col,
	})
}

func (g *Game) updateParticles() {
	alive := g.particles[:0]
	for _, p := range g.particles {
		p.X += p.VX * dt
		p.Y += p.VY * dt
		p.VX *= 0.94
		p.VY *= 0.94
		p.Life -= dt
		if p.Life > 0 {
			alive = append(alive, p)
		}
	}
	g.particles = alive
}

func (g *Game) updatePopups() {
	alive := g.popups[:0]
	for _, pop := range g.popups {
		pop.Y += pop.VY * dt
		pop.Life -= dt
		if pop.Life > 0 {
			alive = append(alive, pop)
		}
	}
	g.popups = alive
}

func (g *Game) Draw(screen *ebiten.Image) {
	screen.Fill(color.RGBA{9, 13, 24, 255})

	var shakeX, shakeY float32
	if g.shakeTimer > 0 {
		shakeX = float32((g.rng.Float64()*2 - 1) * g.shakeStrength)
		shakeY = float32((g.rng.Float64()*2 - 1) * g.shakeStrength)
	}

	// 1. Parallax Starfield & Arena Cyber-Grid
	for _, s := range g.stars {
		vector.DrawFilledCircle(screen, s.X+shakeX*0.3, s.Y+shakeY*0.3, s.Size, color.RGBA{148, 163, 184, s.Alpha}, false)
	}

	gridCol := color.RGBA{30, 41, 59, 150}
	for x := float32(0); x < screenW; x += 32 {
		vector.StrokeLine(screen, x+shakeX, 34, x+shakeX, screenH, 1, gridCol, false)
	}
	for y := float32(34); y < screenH; y += 32 {
		vector.StrokeLine(screen, 0, y+shakeY, screenW, y+shakeY, 1, gridCol, false)
	}

	// Arena border
	vector.StrokeRect(screen, 4+shakeX, 34+shakeY, screenW-8, screenH-38, 1.5, color.RGBA{56, 189, 248, 90}, false)

	// 2. XP Gems
	for _, gem := range g.gems {
		gx := float32(gem.X) + shakeX
		gy := float32(gem.Y) + shakeY
		r := float32(4.5 + math.Sin(gem.Pulse)*1.2)
		vector.DrawFilledCircle(screen, gx, gy, r, color.RGBA{34, 211, 238, 255}, true)
		vector.StrokeCircle(screen, gx, gy, r+2, 1.2, color.RGBA{224, 242, 254, 180}, true)
	}

	// 3. Particles
	for _, p := range g.particles {
		alpha := float32(p.Life / p.MaxLife)
		col := p.Color
		col.A = uint8(float32(col.A) * alpha)
		vector.DrawFilledCircle(screen, float32(p.X)+shakeX, float32(p.Y)+shakeY, p.Size*alpha+0.8, col, true)
	}

	// 4. Bullets
	for _, b := range g.bullets {
		bx := float32(b.X) + shakeX
		by := float32(b.Y) + shakeY
		vector.DrawFilledCircle(screen, bx, by, b.Radius, b.Color, true)
		vector.DrawFilledCircle(screen, bx, by, b.Radius*0.5, color.RGBA{255, 255, 255, 255}, true)
	}

	// 5. Enemies
	for _, e := range g.enemies {
		ex := float32(e.X) + shakeX
		ey := float32(e.Y) + shakeY

		baseCol := color.RGBA{244, 63, 94, 255}
		rimCol := color.RGBA{254, 205, 211, 220}
		if e.Kind == EnemyDasher {
			baseCol = color.RGBA{245, 158, 11, 255}
			rimCol = color.RGBA{254, 243, 199, 220}
		} else if e.Kind == EnemyTank {
			baseCol = color.RGBA{168, 85, 247, 255}
			rimCol = color.RGBA{243, 232, 255, 220}
		}
		if e.HitFlash > 0 {
			baseCol = color.RGBA{255, 255, 255, 255}
		}

		switch e.Kind {
		case EnemyDrone:
			// Diamond hull + core
			drawPolygon(screen, ex, ey, e.Radius, 4, float32(e.Angle), baseCol, rimCol)
		case EnemyDasher:
			// Triangular interceptor dart
			drawPolygon(screen, ex, ey, e.Radius+2, 3, float32(e.Angle), baseCol, rimCol)
		case EnemyTank:
			// Heavy hexagon tank + overhead HP bar
			drawPolygon(screen, ex, ey, e.Radius, 6, float32(g.tick)*0.02, baseCol, rimCol)
			if e.HP < e.MaxHP {
				barW := float32(28)
				ratio := float32(e.HP) / float32(e.MaxHP)
				vector.DrawFilledRect(screen, ex-barW/2, ey-e.Radius-8, barW, 4, color.RGBA{15, 23, 42, 220}, false)
				vector.DrawFilledRect(screen, ex-barW/2, ey-e.Radius-8, barW*ratio, 4, color.RGBA{192, 132, 252, 255}, false)
			}
		}
	}

	// 6. Player Starfighter
	if !g.gameOver {
		px := float32(g.playerX) + shakeX
		py := float32(g.playerY) + shakeY

		visible := true
		if g.invulnTimer > 0 && (g.tick/3)%2 == 1 {
			visible = false
		}
		if visible {
			// Outer shield aura
			vector.StrokeCircle(screen, px, py, 15, 1.5, color.RGBA{56, 189, 248, 120}, true)
			// Ship body
			drawPolygon(screen, px, py, 12, 3, float32(g.aimAngle), color.RGBA{16, 185, 129, 255}, color.RGBA{209, 250, 229, 255})
			// Aiming reticle line
			aimX := px + float32(math.Cos(g.aimAngle))*24
			aimY := py + float32(math.Sin(g.aimAngle))*24
			vector.StrokeLine(screen, px, py, aimX, aimY, 1.5, color.RGBA{56, 189, 248, 190}, true)
			vector.DrawFilledCircle(screen, aimX, aimY, 2.2, color.RGBA{56, 189, 248, 255}, true)
		}
	}

	// 7. Floating Combat Popups
	for _, pop := range g.popups {
		ebitenutil.DebugPrintAt(screen, pop.Text, int(pop.X+float64(shakeX)), int(pop.Y+float64(shakeY)))
	}

	// 8. Top Arcade HUD Bar
	vector.DrawFilledRect(screen, 0, 0, screenW, 32, color.RGBA{15, 23, 42, 245}, false)
	vector.StrokeLine(screen, 0, 32, screenW, 32, 1, color.RGBA{51, 65, 85, 255}, false)

	// Shield segments
	ebitenutil.DebugPrintAt(screen, "SHIELD", 10, 8)
	for i := 0; i < g.maxHP; i++ {
		bx := float32(54 + i*16)
		col := color.RGBA{30, 41, 59, 255}
		if i < g.hp {
			col = color.RGBA{34, 197, 94, 255}
			if g.hp <= 2 {
				col = color.RGBA{239, 68, 68, 255}
			}
		}
		vector.DrawFilledRect(screen, bx, 10, 12, 11, col, false)
		vector.StrokeRect(screen, bx, 10, 12, 11, 1, color.RGBA{148, 163, 184, 180}, false)
	}

	// Wave, Score & Weapon Level
	weaponName := "SINGLE"
	switch g.level {
	case 2:
		weaponName = "TWIN"
	case 3:
		weaponName = "SPREAD"
	default:
		if g.level >= 4 {
			weaponName = "OVERDRIVE"
		}
	}
	hudMid := fmt.Sprintf("WAVE %d   SCORE %05d   LV.%d (%s)", g.wave, g.score, g.level, weaponName)
	ebitenutil.DebugPrintAt(screen, hudMid, 152, 8)

	// XP Bar on right of HUD
	xpRatio := float32(g.xp) / float32(g.xpNext)
	if xpRatio > 1 {
		xpRatio = 1
	}
	vector.DrawFilledRect(screen, 495, 10, 132, 11, color.RGBA{30, 41, 59, 255}, false)
	vector.DrawFilledRect(screen, 495, 10, 132*xpRatio, 11, color.RGBA{56, 189, 248, 255}, false)
	vector.StrokeRect(screen, 495, 10, 132, 11, 1, color.RGBA{125, 211, 252, 200}, false)
	ebitenutil.DebugPrintAt(screen, "XP", 476, 8)

	// Bottom Controls Hint
	ebitenutil.DebugPrintAt(screen, "Move: WASD/Arrows | Fire: SPACE/Z/Click | Dash: X | Pause & Annotate: ` or F8", 12, screenH-18)

	// 9. Game Over Overlay
	if g.gameOver {
		vector.DrawFilledRect(screen, 140, 110, 360, 130, color.RGBA{15, 23, 42, 240}, false)
		vector.StrokeRect(screen, 140, 110, 360, 130, 2, color.RGBA{244, 63, 94, 255}, false)
		ebitenutil.DebugPrintAt(screen, "=== NEON BASTION: SHIELD DEPLETED ===", 194, 130)
		ebitenutil.DebugPrintAt(screen, fmt.Sprintf("Survived to Wave %d  |  Final Score: %d  |  Kills: %d", g.wave, g.score, g.kills), 165, 162)
		ebitenutil.DebugPrintAt(screen, "Press SPACE, ENTER, or R to Launch Again", 195, 198)
	}
}

func drawPolygon(dst *ebiten.Image, cx, cy, radius float32, sides int, rotation float32, fillCol, strokeCol color.RGBA) {
	if sides < 3 {
		return
	}
	var path vector.Path
	for i := 0; i <= sides; i++ {
		ang := rotation + float32(i)*2*math.Pi/float32(sides)
		vx := cx + float32(math.Cos(float64(ang)))*radius
		vy := cy + float32(math.Sin(float64(ang)))*radius
		if i == 0 {
			path.MoveTo(vx, vy)
		} else {
			path.LineTo(vx, vy)
		}
	}
	path.Close()

	// Draw outline + filled center circle for crisp vector arcade aesthetic
	vector.DrawFilledCircle(dst, cx, cy, radius*0.68, fillCol, true)
	op := &vector.StrokeOptions{Width: 2.2}
	vs, is := path.AppendVerticesAndIndicesForStroke(nil, nil, op)
	for i := range vs {
		vs[i].ColorR = float32(strokeCol.R) / 255
		vs[i].ColorG = float32(strokeCol.G) / 255
		vs[i].ColorB = float32(strokeCol.B) / 255
		vs[i].ColorA = float32(strokeCol.A) / 255
	}
	dst.DrawTriangles(vs, is, whiteSubImage, &ebiten.DrawTrianglesOptions{AntiAlias: true})
}

var whiteSubImage = func() *ebiten.Image {
	img := ebiten.NewImage(3, 3)
	img.Fill(color.White)
	return img
}()

func (g *Game) Layout(outsideW, outsideH int) (int, int) {
	return screenW, screenH
}

func main() {
	ebiten.SetWindowSize(screenW*2, screenH*2)
	ebiten.SetWindowTitle("Neon Bastion — Ebitengine Playtest Studio")
	if err := ebiten.RunGame(NewGame()); err != nil {
		log.Fatal(err)
	}
}
