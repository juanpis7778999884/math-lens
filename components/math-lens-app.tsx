'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CameraOff, Check, ChevronDown, ChevronUp, CircleHelp, Copy, Crown, Flame, Gauge, LineChart, Radio, ScanLine, Sparkles, Trophy, Users, X } from 'lucide-react'
import * as THREE from 'three'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { functions, intersectionCurve, sampleSurface, type Difficulty, type MathFunction } from '@/lib/math-lens'

type Figure = 'circle' | 'rectangle' | 'triangle' | 'unknown'
type Student = { id: string; student_id: string; name: string; group_name: string; score: number; streak: number; answered_current_round: boolean; last_answer_correct: boolean | null }
type SessionRow = { status: 'waiting' | 'active' | 'closed'; current_round: number; published_figure: Figure | null; question_text: string | null }

const figureInfo: Record<Figure, { label: string; expression: string; title: string; domain: string; range: string; hint: string; color: string; trivia: { question: string; options: string[]; answer: number; explanation: string } }> = {
  circle: { label: 'Círculo', title: 'Superficie circular', expression: 'x^2 + y^2', domain: 'Todos los reales · ℝ²', range: '[0, ∞)', hint: 'La cámara detectó una silueta circular. Su simetría radial se traduce en una cuenca parabólica.', color: '#44e0d1', trivia: { question: '¿Qué simetría conserva la figura capturada?', options: ['Rotación alrededor del centro', 'Solo reflexión vertical', 'Ninguna'], answer: 0, explanation: 'Un círculo conserva su forma al rotar cualquier ángulo alrededor de su centro.' } },
  rectangle: { label: 'Rectángulo', title: 'Plano rectangular', expression: 'x * y', domain: 'Todos los reales · ℝ²', range: 'Todos los reales · ℝ', hint: 'La cámara detectó cuatro lados y ángulos rectos. El modelo usa una silla de montar para explorar sus ejes.', color: '#a78bfa', trivia: { question: '¿Cuántos ángulos rectos tiene la figura capturada?', options: ['2', '4', 'Depende de la escala'], answer: 1, explanation: 'Un rectángulo tiene cuatro ángulos internos de 90 grados.' } },
  triangle: { label: 'Triángulo', title: 'Superficie triangular', expression: 'sqrt(4 - x^2 - y^2)', domain: 'Disco x² + y² ≤ 4', range: '[0, 2]', hint: 'La cámara detectó tres vértices. El modelo muestra una cúpula para conectar altura, base y área.', color: '#67e8f9', trivia: { question: '¿Cuál es la suma de sus ángulos interiores?', options: ['90°', '180°', '360°'], answer: 1, explanation: 'La suma de los ángulos interiores de cualquier triángulo es 180°.' } },
  unknown: { label: 'Objeto libre', title: 'Exploración libre', expression: '1 / (x^2 + y^2)', domain: 'ℝ² excepto (0, 0)', range: '(0, ∞)', hint: 'La silueta necesita más contraste. Puedes seguir explorando el objeto libre y volver a capturar.', color: '#fb7185', trivia: { question: '¿Qué debes hacer para mejorar la lectura?', options: ['Acercar y buscar más contraste', 'Tapar la cámara', 'Girar la pantalla'], answer: 0, explanation: 'Una silueta con buen contraste ayuda a identificar bordes y vértices.' } },
}

function Surface({ active, k }: { active: MathFunction | (typeof figureInfo)[Figure]; k: number }) {
  const data = useMemo(() => sampleSurface(active.expression), [active.expression])
  const curve = useMemo(() => intersectionCurve(active.expression, k), [active.expression, k])
  const geometry = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3)); g.setIndex(data.indices); g.computeVertexNormals(); return g }, [data])
  const toPoints = (values: number[]) => Array.from({ length: values.length / 3 }, (_, i) => [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]] as [number, number, number])
  const upper = toPoints(curve.upper), lower = toPoints(curve.lower)
  return <><mesh geometry={geometry}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.12} /></mesh><gridHelper args={[7, 14, '#23424b', '#15242b']} /><axesHelper args={[3.5]} /><mesh position={[0, 0, k * 0.42]}><planeGeometry args={[6.4, 6.4]} /><meshBasicMaterial color="#f8a24a" transparent opacity={0.06} side={THREE.DoubleSide} /></mesh>{upper.length > 1 && <Line points={upper} color="#fbbf24" lineWidth={2.5} />}{lower.length > 1 && <Line points={lower} color="#fbbf24" lineWidth={2.5} />}</>
}

function Scene({ active, k }: { active: MathFunction | (typeof figureInfo)[Figure]; k: number }) { 
  return <Canvas dpr={[1, 2]} gl={{ antialias: true }}>
    <PerspectiveCamera makeDefault position={[6, 5, 6]} fov={42} />
    <color attach="background" args={['#0a0a0f']} />
    <ambientLight intensity={1.6} />
    <directionalLight position={[4, 5, 6]} intensity={2.5} color="#c9fbff" />
    <pointLight position={[-4, -2, 4]} intensity={8} distance={12} color="#7c3aed" />
    <Surface active={active} k={k} />
    <OrbitControls enableDamping minDistance={4} maxDistance={13} />
  </Canvas> 
}

const levels: { label: Difficulty; count: number }[] = [{ label: 'Fácil', count: 2 }, { label: 'Medio', count: 2 }, { label: 'Difícil', count: 2 }]

// Función de detección mejorada SIN OpenCV (más confiable)
function detectFigureWithCanvas(sourceCanvas: HTMLCanvasElement): { figure: Figure; confidence: number } {
  const size = 200
  const analysisCanvas = document.createElement('canvas')
  analysisCanvas.width = size
  analysisCanvas.height = size
  const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true })
  if (!analysisContext || sourceCanvas.width === 0 || sourceCanvas.height === 0) { 
    return { figure: 'unknown', confidence: 0 }
  }
  
  // Recortar al 70% central
  const cropRatio = 0.7
  const cropW = sourceCanvas.width * cropRatio
  const cropH = sourceCanvas.height * cropRatio
  const cropX = (sourceCanvas.width - cropW) / 2
  const cropY = (sourceCanvas.height - cropH) / 2
  analysisContext.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, size, size)
  
  // Mejorar contraste
  const imageData = analysisContext.getImageData(0, 0, size, size)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i+1] + data[i+2]) / 3
    const enhanced = Math.min(255, Math.max(0, (avg - 30) * 1.5))
    data[i] = data[i+1] = data[i+2] = enhanced
  }
  analysisContext.putImageData(imageData, 0, 0)
  
  const pixels = analysisContext.getImageData(0, 0, size, size).data
  const grays = new Float32Array(size * size)
  for (let i = 0; i < pixels.length; i += 4) grays[i / 4] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
  
  const mean = grays.reduce((sum, value) => sum + value, 0) / grays.length
  const variance = grays.reduce((sum, value) => sum + (value - mean) ** 2, 0) / grays.length
  
  if (variance < 60) { return { figure: 'unknown', confidence: 0 } }

  // Detección de bordes con Sobel
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
  const edges = new Float32Array(size * size)
  let maxEdge = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      let sx = 0; let sy = 0; let k = 0
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) { 
        const v = grays[(y + ky) * size + (x + kx)]
        sx += v * gx[k]
        sy += v * gy[k]
        k++ 
      }
      const mag = Math.sqrt(sx * sx + sy * sy)
      edges[y * size + x] = mag
      if (mag > maxEdge) maxEdge = mag
    }
  }
  
  if (maxEdge < 40) { return { figure: 'unknown', confidence: 0 } }
  
  const edgeThreshold = Math.max(30, maxEdge * 0.1)
  let edgeMask: boolean[] = new Array(size * size)
  for (let i = 0; i < edges.length; i++) edgeMask[i] = edges[i] > edgeThreshold
  
  // Dilatar bordes
  const dilate = (mask: boolean[]): boolean[] => {
    const out = new Array(size * size).fill(false)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (!mask[i]) continue
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy; const nx = x + dx
        if (ny >= 0 && ny < size && nx >= 0 && nx < size) out[ny * size + nx] = true
      }
    }
    return out
  }
  edgeMask = dilate(edgeMask)

  // Flood-fill
  const reached = new Array(size * size).fill(false)
  const stack: number[] = []
  for (let x = 0; x < size; x++) stack.push(x, (size - 1) * size + x)
  for (let y = 0; y < size; y++) stack.push(y * size, y * size + size - 1)
  while (stack.length) {
    const index = stack.pop()!
    if (index < 0 || index >= size * size || reached[index] || edgeMask[index]) continue
    reached[index] = true
    const x = index % size; const y = Math.floor(index / size)
    if (x > 0) stack.push(index - 1)
    if (x < size - 1) stack.push(index + 1)
    if (y > 0) stack.push(index - size)
    if (y < size - 1) stack.push(index + size)
  }
  
  const filled = edgeMask.map((isEdge, index) => isEdge || !reached[index])
  const points = filled.flatMap((isObject, index) => isObject ? [{ x: index % size, y: Math.floor(index / size) }] : [])
  
  if (points.length < 60 || points.length > size * size * 0.92) { 
    return { figure: 'unknown', confidence: 0 }
  }
  
  const minX = Math.min(...points.map(p => p.x))
  const maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxY = Math.max(...points.map(p => p.y))
  const boxArea = (maxX - minX + 1) * (maxY - minY + 1)
  const extent = points.length / boxArea

  // Contar vértices
  const idx = (x: number, y: number) => y * size + x
  const inside = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size && filled[idx(x, y)]
  let start: { x: number; y: number } | null = null
  outer: for (let y = minY; y <= maxY; y++) { 
    for (let x = minX; x <= maxX; x++) { 
      if (inside(x, y)) { start = { x, y }; break outer } 
    } 
  }
  
  let corners = 0
  if (start) {
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
    const contour: { x: number; y: number }[] = [start]
    let current = start
    let backtrack = 6
    let guard = 0
    while (guard++ < 6000) {
      let moved = false
      for (let k = 0; k < 8; k++) {
        const d = dirs[(backtrack + k) % 8]
        const nx = current.x + d[0]
        const ny = current.y + d[1]
        if (inside(nx, ny)) { 
          current = { x: nx, y: ny }
          backtrack = (backtrack + k + 5) % 8
          contour.push(current)
          moved = true
          break 
        }
      }
      if (!moved || (current.x === start.x && current.y === start.y && contour.length > 4)) break
    }
    
    const step = Math.max(3, Math.floor(contour.length / 60))
    const sample = contour.filter((_, i) => i % step === 0)
    const angles = sample.map((point, i) => {
      const prev = sample[(i - 1 + sample.length) % sample.length]
      const next = sample[(i + 1) % sample.length]
      const v1x = point.x - prev.x
      const v1y = point.y - prev.y
      const v2x = next.x - point.x
      const v2y = next.y - point.y
      const dot = v1x * v2x + v1y * v2y
      const cross = v1x * v2y - v1y * v2x
      return Math.atan2(Math.abs(cross), dot) * (180 / Math.PI)
    })
    
    for (let i = 0; i < angles.length; i++) {
      const prev = angles[(i - 1 + angles.length) % angles.length]
      const next = angles[(i + 1) % angles.length]
      if (angles[i] > 20 && angles[i] >= prev && angles[i] >= next) corners++
    }
  }

  // Clasificar
  let detectedFigure: Figure = 'unknown'
  let confidence = 0
  
  if (corners <= 1) {
    detectedFigure = 'circle'
    confidence = 0.85
  } else if (corners === 3) {
    detectedFigure = 'triangle'
    confidence = 0.85
  } else if (corners >= 4) {
    detectedFigure = 'rectangle'
    confidence = 0.85
  } else {
    const references: [Figure, number][] = [['circle', 0.78], ['rectangle', 0.94], ['triangle', 0.5]]
    const best = references.reduce((closest, current) => 
      Math.abs(current[1] - extent) < Math.abs(closest[1] - extent) ? current : closest
    )
    detectedFigure = best[0]
    confidence = 0.7
  }
  
  return { figure: detectedFigure, confidence }
}

function CameraPanel({ cameraOn, photo, videoRef, canvasRef, error, startCamera, stopCamera, captureFigure, processing }: { 
  cameraOn: boolean; 
  photo: string | null; 
  videoRef: React.RefObject<HTMLVideoElement | null>; 
  canvasRef: React.RefObject<HTMLCanvasElement | null>; 
  error: string; 
  startCamera: () => void; 
  stopCamera: () => void; 
  captureFigure: () => void;
  processing: boolean;
}) { 
  return <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card/70 p-3">
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-xl bg-background md:w-72">
        {cameraOn ? (
          <>
            <video ref={videoRef} playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-4 rounded-lg border border-primary/70">
              <ScanLine className="absolute right-2 top-2 size-5 text-primary" />
            </div>
          </>
        ) : photo ? (
          <img src={photo} alt="Captura del objeto real" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Camera className="size-8" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {processing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <p className="text-sm font-semibold">Cámara de figura real</p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Apunta a un círculo, rectángulo o triángulo. MathLens toma una captura, interpreta su silueta y adapta el modelo 3D y la trivia.</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {cameraOn ? (
            <>
              <button onClick={captureFigure} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground" disabled={processing}>
                {processing ? 'Procesando...' : 'Capturar figura'}
              </button>
              <button onClick={stopCamera} className="rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground">
                <CameraOff className="mr-1 inline size-3.5" /> Cerrar cámara
              </button>
            </>
          ) : (
            <button onClick={startCamera} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              <Camera className="mr-1 inline size-3.5" /> Abrir cámara
            </button>
          )}
        </div>
      </div>
    </div>
  </div> 
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { 
  return <div className="rounded-xl border border-border bg-card p-4">
    <div className="mb-4 text-primary [&>svg]:size-4">{icon}</div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-mono text-2xl">{value}</p>
  </div> 
}

function Teacher({ students, sessionId, copySession, copied, cameraOn, photo, videoRef, canvasRef, cameraError, startCamera, stopCamera, captureFigure, uploadFigure, figure, setFigure, teacherQuestion, setTeacherQuestion, publishTeacherQuestion, closeRound, teacherPublished, publishedFigure, publishError, processing, confidence }: { 
  students: Student[]; 
  sessionId: string; 
  copySession: () => void; 
  copied: boolean; 
  cameraOn: boolean; 
  photo: string | null; 
  videoRef: React.RefObject<HTMLVideoElement | null>; 
  canvasRef: React.RefObject<HTMLCanvasElement | null>; 
  cameraError: string; 
  startCamera: () => void; 
  stopCamera: () => void; 
  captureFigure: () => void; 
  uploadFigure: (file: File) => void; 
  figure: Figure; 
  setFigure: (figure: Figure) => void; 
  teacherQuestion: string; 
  setTeacherQuestion: (value: string) => void; 
  publishTeacherQuestion: () => void; 
  closeRound: () => void; 
  teacherPublished: boolean; 
  publishedFigure: Figure; 
  publishError: string;
  processing: boolean;
  confidence: number;
}) { 
  const total = students.reduce((sum, s) => sum + s.score, 0); 
  return <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Panel del profesor</p>
        <h1 className="text-balance text-3xl font-semibold md:text-5xl">La clase, en tiempo real.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Observa quién está conectado, quién respondió y cómo progresa cada estudiante durante la exploración.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${teacherPublished ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
          <span className={`size-2 rounded-full ${teacherPublished ? 'animate-pulse bg-primary' : 'bg-muted-foreground'}`} />
          {teacherPublished ? 'Ronda activa' : 'Sin ronda activa'}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
          <Radio className="size-4 text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Código de sesión</p>
            <button onClick={copySession} className="flex items-center gap-2 font-mono text-sm text-primary">
              {sessionId} {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      <div className="rounded-2xl border border-primary/20 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Crear ronda</p>
            <h2 className="mt-1 text-lg font-semibold">Captura una figura de tu entorno</h2>
          </div>
          <ScanLine className="size-5 text-primary" />
        </div>
        <CameraPanel 
          cameraOn={cameraOn} 
          photo={photo} 
          videoRef={videoRef} 
          canvasRef={canvasRef} 
          error={cameraError} 
          startCamera={startCamera} 
          stopCamera={stopCamera} 
          captureFigure={captureFigure}
          processing={processing}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/60">
            Subir imagen
            <input type="file" accept="image/*" className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) uploadFigure(file) }} />
          </label>
          {figure !== 'unknown' && (
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
              Detectado: {figureInfo[figure].label} {confidence > 0 && `(${Math.round(confidence * 100)}%)`}
            </span>
          )}
          {processing && (
            <span className="rounded-full bg-yellow-500/20 px-3 py-1.5 text-xs text-yellow-500 animate-pulse">
              Procesando...
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="teacher-question" className="text-xs font-semibold">Pregunta para la clase</label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Este texto aparece como encabezado de la pregunta. Las 4 opciones de respuesta que verá el estudiante son las predefinidas de dominio/rango para la figura seleccionada abajo, no las que escribas aquí.</p>
          <textarea id="teacher-question" value={teacherQuestion} onChange={e => setTeacherQuestion(e.target.value)} placeholder={figure !== 'unknown' ? `¿Qué propiedad observas en este ${figureInfo[figure].label.toLowerCase()}?` : 'Captura una figura para comenzar...'} className="min-h-20 resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
          <div className="flex items-center justify-between gap-2">
            <select value={figure} onChange={e => setFigure(e.target.value as Figure)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <option value="circle">Círculo</option>
              <option value="rectangle">Rectángulo</option>
              <option value="triangle">Triángulo</option>
              <option value="unknown">Objeto libre</option>
            </select>
            <button disabled={!teacherQuestion.trim() || figure === 'unknown' || processing} onClick={publishTeacherQuestion} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
              {teacherPublished ? 'Publicada en vivo' : 'Publicar pregunta'}
            </button>
            {teacherPublished && <button onClick={closeRound} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:border-destructive/60 hover:text-destructive">Cerrar ronda</button>}
            {publishError && <p className="w-full text-[11px] text-destructive">{publishError}</p>}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Vista previa</p>
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="text-xs text-primary">{publishedFigure !== 'unknown' ? figureInfo[publishedFigure].label : 'Sin figura publicada'}</p>
          <p className="mt-2 text-sm leading-relaxed">{teacherPublished ? teacherQuestion : 'La pregunta aparecerá aquí antes de compartirla con la clase.'}</p>
          {teacherPublished && <p className="mt-4 text-xs text-muted-foreground">Los estudiantes recibirán la figura, el modelo y esta pregunta en su pantalla.</p>}
        </div>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat icon={<Users />} label="Conectados" value={String(students.length)} />
      <Stat icon={<Trophy />} label="Puntos de clase" value={String(total)} />
      <Stat icon={<LineChart />} label="Respondieron" value={String(students.filter(s => s.answered_current_round).length)} />
      <Stat icon={<Check />} label="Acertaron esta ronda" value={students.filter(s => s.answered_current_round).length === 0 ? '—' : `${Math.round((students.filter(s => s.last_answer_correct).length / students.filter(s => s.answered_current_round).length) * 100)}%`} />
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Crown className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Ranking de estudiantes</h2>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">ACTUALIZACIÓN REALTIME</span>
      </div>
      {students.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Aún no hay estudiantes. Comparte el código {sessionId}.</div>
      ) : (
        <div className="flex flex-col">
          {students.map((student, i) => (
            <div key={student.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-4 last:border-0">
              <span className="w-8 font-mono text-sm text-primary">{String(i + 1).padStart(2, '0')}</span>
              <div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold">{student.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.group_name} · {student.streak} racha</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${!student.answered_current_round ? 'bg-secondary text-muted-foreground' : student.last_answer_correct ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                {!student.answered_current_round ? 'En espera' : student.last_answer_correct ? '✓ Acertó' : '✗ Falló'}
              </span>
              <span className="w-20 text-right font-mono text-sm text-primary">{student.score} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </section> 
}

export default function MathLensApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const videoRef = useRef<HTMLVideoElement>(null); 
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const streamRef = useRef<MediaStream | null>(null)
  
  const [mode, setMode] = useState<'student' | 'teacher'>('student'); 
  const [cameraOn, setCameraOn] = useState(false); 
  const [photo, setPhoto] = useState<string | null>(null); 
  const [figure, setFigure] = useState<Figure>('unknown'); 
  const [cameraError, setCameraError] = useState('')
  const [level, setLevel] = useState<Difficulty>('Fácil'); 
  const [index, setIndex] = useState(0); 
  const [k, setK] = useState(3); 
  const [teacherQuestion, setTeacherQuestion] = useState(''); 
  const [publishedFigure, setPublishedFigure] = useState<Figure>('unknown'); 
  const [teacherPublished, setTeacherPublished] = useState(false); 
  const [publishError, setPublishError] = useState(''); 
  const [open, setOpen] = useState(false); 
  const [cameraOpen, setCameraOpen] = useState(false); 
  const [modal, setModal] = useState(false); 
  const [answered, setAnswered] = useState<number | null>(null); 
  const [score, setScore] = useState(0); 
  const [streak, setStreak] = useState(0); 
  const [name, setName] = useState(''); 
  const [group, setGroup] = useState(''); 
  const [joined, setJoined] = useState(false); 
  const [joinError, setJoinError] = useState(''); 
  const [session, setSession] = useState<SessionRow | null>(null); 
  const [students, setStudents] = useState<Student[]>([]); 
  const [copied, setCopied] = useState(false); 
  const [processing, setProcessing] = useState(false);
  const [confidence, setConfidence] = useState(0);
  
  const sessionId = 'clase-hoy'; 
  const studentId = useMemo(() => { 
    const key = 'mathlens-student-id'; 
    const old = typeof window !== 'undefined' ? localStorage.getItem(key) : null; 
    if (old) return old; 
    const value = crypto.randomUUID(); 
    if (typeof window !== 'undefined') localStorage.setItem(key, value); 
    return value 
  }, [])
  
  const active = figure !== 'unknown' ? figureInfo[figure] : functions.filter(f => f.difficulty === level)[index % 2]

  // Función de captura mejorada
  const captureFigure = () => { 
    const video = videoRef.current; 
    if (!video) return; 
    
    setProcessing(true);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.min(video.videoWidth, 1280);
    tempCanvas.height = Math.min(video.videoHeight, 720);
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      setProcessing(false);
      return;
    }
    
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    setPhoto(tempCanvas.toDataURL('image/jpeg', 0.9));
    
    // Detectar figura usando el canvas
    setTimeout(() => {
      const result = detectFigureWithCanvas(tempCanvas);
      console.log('Detección:', result);
      
      if (result.figure !== 'unknown' && result.confidence > 0.5) {
        setFigure(result.figure);
        setConfidence(result.confidence);
      } else {
        setFigure('unknown');
        setConfidence(0);
      }
      setProcessing(false);
    }, 100);
    
    stopCamera();
  }

  const uploadFigure = (file: File) => { 
    const url = URL.createObjectURL(file); 
    setPhoto(url); 
    setProcessing(true);
    
    const image = new Image(); 
    image.onload = () => { 
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setProcessing(false);
        return;
      }
      ctx.drawImage(image, 0, 0);
      
      setTimeout(() => {
        const result = detectFigureWithCanvas(canvas);
        console.log('Detección subida:', result);
        
        if (result.figure !== 'unknown' && result.confidence > 0.5) {
          setFigure(result.figure);
          setConfidence(result.confidence);
        } else {
          setFigure('unknown');
          setConfidence(0);
        }
        setProcessing(false);
      }, 100);
      
      URL.revokeObjectURL(url);
    }; 
    image.src = url;
  }

  const publishTeacherQuestion = async () => {
    if (!teacherQuestion.trim() || figure === 'unknown') return
    setPublishError('')
    const round = Date.now()
    const { error } = await supabase.from('mathlens_sessions').upsert({ session_id: sessionId, status: 'active', current_round: round, published_figure: figure, question_text: teacherQuestion.trim() }, { onConflict: 'session_id' })
    if (error) { console.error('publishTeacherQuestion error:', error); setPublishError(error.message || 'No se pudo publicar la ronda.'); return }
    setPublishedFigure(figure)
    setTeacherPublished(true)
    const { error: resetError } = await supabase.from('mathlens_students').update({ answered_current_round: false, last_answer_correct: null }).eq('session_id', sessionId)
    if (resetError) console.error('reset answered error:', resetError)
  }

  const closeRound = async () => {
    setPublishError('')
    const { error } = await supabase.from('mathlens_sessions').upsert({ session_id: sessionId, status: 'waiting', current_round: Date.now(), published_figure: publishedFigure, question_text: teacherQuestion.trim() }, { onConflict: 'session_id' })
    if (error) { console.error('closeRound error:', error); setPublishError(error.message || 'No se pudo cerrar la ronda.'); return }
    setTeacherPublished(false)
    setAnswered(null)
  }

  const joinClass = async () => { 
    if (!name.trim() || !group.trim()) return; 
    setJoinError(''); 
    const { data: existing } = await supabase.from('mathlens_students').select('score,streak').eq('session_id', sessionId).eq('student_id', studentId).maybeSingle(); 
    const { error } = await supabase.from('mathlens_students').upsert({ session_id: sessionId, student_id: studentId, name: name.trim(), group_name: group.trim() }, { onConflict: 'session_id,student_id' }); 
    if (error) { console.error('joinClass error:', error); setJoinError(error.message || 'No se pudo unir a la clase.'); return }; 
    if (existing) { setScore(existing.score); setStreak(existing.streak) }; 
    setJoined(true) 
  }

  const answer = async (choice: number) => { 
    if (answered !== null) return; 
    setAnswered(choice); 
    const correct = choice === active.trivia.answer; 
    const nextScore = score + (correct ? 100 : 0); 
    const nextStreak = correct ? streak + 1 : 0; 
    setScore(nextScore); 
    setStreak(nextStreak); 
    if (joined) await supabase.from('mathlens_students').update({ score: nextScore, streak: nextStreak, answered_current_round: true, last_answer_correct: correct }).eq('session_id', sessionId).eq('student_id', studentId) 
  }

  const next = () => { setAnswered(null); setModal(false); setIndex(i => i + 1) }; 
  
  const copySession = async () => { await navigator.clipboard?.writeText(sessionId); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const startCamera = async () => { 
    try { 
      setCameraError(''); 
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, 
        audio: false 
      }); 
      streamRef.current = stream; 
      setCameraOn(true) 
    } catch { 
      setCameraError('No se pudo abrir la cámara. Revisa el permiso del navegador.') 
    } 
  }

  const stopCamera = () => { 
    streamRef.current?.getTracks().forEach(t => t.stop()); 
    streamRef.current = null; 
    if (videoRef.current) videoRef.current.srcObject = null; 
    setCameraOn(false) 
  }

  useEffect(() => { 
    if (cameraOn && videoRef.current && streamRef.current) { 
      videoRef.current.srcObject = streamRef.current; 
      videoRef.current.play().catch(() => {}) 
    } 
  }, [cameraOn])

  useEffect(() => {
    let cancelled = false
    let studentChannel: ReturnType<typeof supabase.channel> | undefined
    const channelName = `mathlens-students-${sessionId}`
    const load = async () => {
      await supabase.auth.getSession()
      const { data: currentSession } = await supabase.from('mathlens_sessions').select('status,current_round,published_figure,question_text').eq('session_id', sessionId).maybeSingle()
      if (!cancelled && currentSession) setSession(currentSession as SessionRow)
      const { data } = await supabase.from('mathlens_students').select('id,student_id,name,group_name,score,streak,answered_current_round,last_answer_correct').eq('session_id', sessionId).order('score', { ascending: false })
      if (!cancelled && data) setStudents(data as Student[])
      const previous = supabase.getChannels().find(item => item.topic === `realtime:${channelName}`)
      if (previous) await supabase.removeChannel(previous)
      if (cancelled) return
      studentChannel = supabase.channel(channelName)
      studentChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'mathlens_students', filter: `session_id=eq.${sessionId}` }, async () => {
        const { data: refreshed } = await supabase.from('mathlens_students').select('id,student_id,name,group_name,score,streak,answered_current_round,last_answer_correct').eq('session_id', sessionId).order('score', { ascending: false })
        if (!cancelled && refreshed) setStudents(refreshed as Student[])
      })
      await studentChannel.subscribe()
    }
    load()
    return () => { cancelled = true; if (studentChannel) void supabase.removeChannel(studentChannel) }
  }, [supabase])

  useEffect(() => { if (mode !== 'student' || !session || session.status !== 'active') return; if (session.published_figure) setFigure(session.published_figure); setAnswered(null) }, [mode, session])

  useEffect(() => {
    let cancelled = false
    const channelName = `mathlens-session-${sessionId}`
    const previous = supabase.getChannels().find(item => item.topic === `realtime:${channelName}`)
    if (previous) void supabase.removeChannel(previous)
    const channel = supabase.channel(channelName)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'mathlens_sessions', filter: `session_id=eq.${sessionId}` }, async () => {
      const { data: refreshed } = await supabase.from('mathlens_sessions').select('status,current_round,published_figure,question_text').eq('session_id', sessionId).maybeSingle()
      if (!cancelled && refreshed) setSession(refreshed as SessionRow)
    })
    channel.subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('mathlens_sessions realtime status:', status) })
    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [supabase])

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur md:px-8 md:py-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="size-4" /></div>
          <div><p className="font-mono text-xs font-bold tracking-[0.2em] text-primary">MATHLENS</p><p className="hidden text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:block">Objetos reales → matemáticas</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-1">
            <button onClick={() => setMode('student')} className={`rounded-md px-3 py-1.5 text-xs ${mode === 'student' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Estudiante</button>
            <button onClick={() => setMode('teacher')} className={`rounded-md px-3 py-1.5 text-xs ${mode === 'teacher' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Profesor</button>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
            <Trophy className="size-3.5" /> {score.toString().padStart(4, '0')}
          </div>
        </div>
      </header>

      {mode === 'teacher' ? (
        <Teacher 
          students={students} 
          sessionId={sessionId} 
          copySession={copySession} 
          copied={copied} 
          cameraOn={cameraOn} 
          photo={photo} 
          videoRef={videoRef} 
          canvasRef={canvasRef} 
          cameraError={cameraError} 
          startCamera={startCamera} 
          stopCamera={stopCamera} 
          captureFigure={captureFigure} 
          uploadFigure={uploadFigure} 
          figure={figure} 
          setFigure={setFigure} 
          teacherQuestion={teacherQuestion} 
          setTeacherQuestion={setTeacherQuestion} 
          publishTeacherQuestion={publishTeacherQuestion} 
          closeRound={closeRound} 
          teacherPublished={teacherPublished} 
          publishedFigure={publishedFigure} 
          publishError={publishError}
          processing={processing}
          confidence={confidence}
        />
      ) : (
        <>
          <section className="flex flex-col gap-2 border-b border-border/50 bg-card/40 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="flex items-center gap-3">
              <Radio className="size-3.5 text-primary" />
              <span className="text-xs text-primary">Sesión en vivo</span>
              <span className="font-mono text-xs text-muted-foreground">{sessionId}</span>
              <button onClick={copySession} aria-label="Copiar código de sesión" className="text-muted-foreground hover:text-primary">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            {joined ? (
              <p className="text-xs text-muted-foreground">Conectado como <b className="text-foreground">{name}</b></p>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <form onSubmit={e => { e.preventDefault(); joinClass() }} className="flex gap-2">
                  <input value={name} onChange={e => setName(e.target.value)} aria-label="Tu nombre" placeholder="Tu nombre" className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary" />
                  <input value={group} onChange={e => setGroup(e.target.value)} aria-label="Tu grupo" placeholder="Tu grupo" className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary" />
                  <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Unirme</button>
                </form>
                {joinError && <p className="text-[11px] text-destructive">{joinError}</p>}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4 px-3 py-4 md:px-8 md:py-7">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Cámara de aula · figura {figureInfo[figure].label.toLowerCase()}
                  {confidence > 0 && <span className="ml-2 text-primary">({Math.round(confidence * 100)}% confianza)</span>}
                </p>
                <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-4xl">Escanea un objeto real</h1>
              </div>
              <div className="flex gap-1.5">
                {levels.map(l => (
                  <button key={l.label} onClick={() => { setLevel(l.label); setIndex(0); setFigure('unknown'); setAnswered(null) }} aria-label={`Nivel ${l.label}`} title={l.label} className={`grid size-8 place-items-center rounded-full border text-[10px] font-semibold ${level === l.label && figure === 'unknown' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
                    {l.label[0]}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setCameraOpen(!cameraOpen)} className="flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary">
              <Camera className="size-3.5" /> {cameraOpen ? 'Ocultar cámara' : 'Usar mi cámara'}{cameraOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>

            {cameraOpen && (
              <CameraPanel 
                cameraOn={cameraOn} 
                photo={photo} 
                videoRef={videoRef} 
                canvasRef={canvasRef} 
                error={cameraError} 
                startCamera={startCamera} 
                stopCamera={stopCamera} 
                captureFigure={captureFigure}
                processing={processing}
              />
            )}

            <div className="relative min-h-[390px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/30">
              <div className="absolute inset-0"><Scene active={active} k={k} /></div>
              <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
                <span className="rounded-full border border-primary/30 bg-background/80 px-3 py-1.5 font-mono text-xs text-primary backdrop-blur">{active.expression.replaceAll('*', ' · ')}</span>
                <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">modelo: {figureInfo[figure].label}</span>
                {confidence > 0 && (
                  <span className="rounded-full border border-primary/30 bg-primary/20 px-3 py-1.5 text-[10px] uppercase tracking-wider text-primary backdrop-blur">
                    {Math.round(confidence * 100)}% confianza
                  </span>
                )}
                {processing && (
                  <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-3 py-1.5 text-[10px] uppercase tracking-wider text-yellow-500 backdrop-blur animate-pulse">
                    Procesando...
                  </span>
                )}
              </div>
              <div className="absolute right-3 top-3 z-10 w-[min(320px,calc(100%-24px))] rounded-xl border border-border/80 bg-background/90 p-4 shadow-xl backdrop-blur-xl">
                <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2 rounded-full bg-primary" /> Insight <span className="font-mono text-[10px] text-muted-foreground">/{active.title}</span>
                  </span>
                  {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </button>
                {open && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Figura interpretada</p>
                      <p className="mt-1 font-mono text-lg text-primary">{figureInfo[figure].label}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-secondary/60 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Dominio</p>
                        <p className="mt-1 text-xs leading-relaxed">{active.domain}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/60 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Rango</p>
                        <p className="mt-1 text-xs leading-relaxed">{active.range}</p>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{active.hint}</p>
                    <label className="flex flex-col gap-2">
                      <span className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>Plano de corte</span>
                        <span className="font-mono text-primary">k = {k.toFixed(1)}</span>
                      </span>
                      <input aria-label="Altura del plano de corte" type="range" min="-5" max="8" step="0.1" value={k} onChange={e => setK(Number(e.target.value))} className="accent-primary" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="text-xs text-muted-foreground">La pregunta se genera desde la figura capturada: <b className="text-foreground">{figureInfo[figure].label}</b>.</p>
              <button onClick={() => setModal(true)} className={`flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground ${answered === null ? 'animate-pulse shadow-lg shadow-primary/40' : ''}`}>
                <CircleHelp className="size-4" /> Trivia de la figura
              </button>
            </div>
          </section>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Pregunta de {figureInfo[figure].label}</p>
                <h2 className="mt-2 text-xl font-semibold text-balance">{(session?.status === 'active' && session.question_text) || active.trivia.question}</h2>
              </div>
              <button aria-label="Cerrar trivia" onClick={() => setModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {active.trivia.options.map((option, i) => (
                <button key={option} onClick={() => answer(i)} className={`rounded-xl border p-3 text-left text-sm transition ${answered === null ? 'border-border hover:border-primary/50 hover:bg-primary/5' : i === active.trivia.answer ? 'border-primary bg-primary/10 text-primary' : answered === i ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border opacity-50'}`}>
                  <span className="mr-3 font-mono text-xs text-muted-foreground">0{i + 1}</span>{option}
                </button>
              ))}
            </div>
            {answered !== null && (
              <div className="mt-4 rounded-xl bg-secondary/60 p-3">
                <p className={`text-xs font-semibold ${answered === active.trivia.answer ? 'text-primary' : 'text-destructive'}`}>
                  {answered === active.trivia.answer ? 'Correcto · +100 puntos' : 'Revisa la figura capturada'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{active.trivia.explanation}</p>
              </div>
            )}
            {answered !== null && (
              <button onClick={next} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground">
                Siguiente <ChevronDown className="size-4 -rotate-90" />
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}