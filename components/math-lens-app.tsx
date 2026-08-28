'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Line } from '@react-three/drei'
import { useMemo, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, CircleHelp, Flame, Gauge, LockKeyhole, Sparkles, Trophy, X, Users, Radio, Copy, Check } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import * as THREE from 'three'
import { functions, intersectionCurve, sampleSurface, type Difficulty, type MathFunction } from '@/lib/math-lens'

function Surface({ active, k }: { active: MathFunction; k: number }) {
  const data = useMemo(() => sampleSurface(active.expression), [active.expression])
  const curve = useMemo(() => intersectionCurve(active.expression, k), [active.expression, k])
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3))
    g.setIndex(data.indices)
    g.computeVertexNormals()
    return g
  }, [data])
  const curvePoints = Array.from({ length: curve.length / 3 }, (_, i) => [curve[i * 3], curve[i * 3 + 1], curve[i * 3 + 2]] as [number, number, number])
  return <>
    <mesh geometry={geometry}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.12} /></mesh>
    <gridHelper args={[7, 14, '#23424b', '#15242b']} />
    <axesHelper args={[3.5]} />
    <mesh position={[0, 0, k * 0.42]}><planeGeometry args={[6.4, 6.4]} /><meshBasicMaterial color="#f8a24a" transparent opacity={0.06} side={THREE.DoubleSide} /></mesh>
    {curvePoints.length > 1 && <Line points={curvePoints} color="#fbbf24" lineWidth={2.5} />}
  </>
}

function Scene({ active, k }: { active: MathFunction; k: number }) {
  return <Canvas dpr={[1, 2]} gl={{ antialias: true }}>
    <PerspectiveCamera makeDefault position={[6, 5, 6]} fov={42} />
    <color attach="background" args={['#0a0a0f']} />
    <ambientLight intensity={1.6} /><directionalLight position={[4, 5, 6]} intensity={2.5} color="#c9fbff" /><pointLight position={[-4, -2, 4]} intensity={8} distance={12} color="#7c3aed" />
    <Surface active={active} k={k} /><OrbitControls enableDamping minDistance={4} maxDistance={13} />
  </Canvas>
}

const levels: { label: Difficulty; count: number }[] = [{ label: 'Fácil', count: 2 }, { label: 'Medio', count: 2 }, { label: 'Difícil', count: 2 }]

export default function MathLensApp() {
  const [level, setLevel] = useState<Difficulty>('Fácil')
  const [index, setIndex] = useState(0)
  const [k, setK] = useState(3)
  const [open, setOpen] = useState(true)
  const [modal, setModal] = useState(false)
  const [answered, setAnswered] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(3)
  const [completed, setCompleted] = useState<string[]>([])
  const [students, setStudents] = useState<{ id: string; name: string; group_name: string; score: number; streak: number }[]>([])
  const [studentName, setStudentName] = useState('')
  const [joined, setJoined] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const sessionId = 'clase-hoy'
  const studentId = useMemo(() => { const key = 'mathlens-student-id'; const existing = typeof window !== 'undefined' ? localStorage.getItem(key) : null; if (existing) return existing; const value = crypto.randomUUID(); if (typeof window !== 'undefined') localStorage.setItem(key, value); return value }, [])
  const active = functions.filter(f => f.difficulty === level)[index % 2]

  useEffect(() => { try { setCompleted(JSON.parse(localStorage.getItem('mathlens-completed') || '[]')) } catch {} }, [])
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined
    const load = async () => {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) await supabase.auth.signInAnonymously()
      const { data } = await supabase.from('mathlens_students').select('id,name,group_name,score,streak').eq('session_id', sessionId).order('score', { ascending: false })
      if (data) setStudents(data)
      channel = supabase.channel(`mathlens-${sessionId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'mathlens_students', filter: `session_id=eq.${sessionId}` }, async () => {
        const { data: refreshed } = await supabase.from('mathlens_students').select('id,name,group_name,score,streak').eq('session_id', sessionId).order('score', { ascending: false }); if (refreshed) setStudents(refreshed)
      }).subscribe()
    }
    load(); return () => { if (channel) supabase.removeChannel(channel) }
  }, [supabase])
  const joinClass = async () => { const name = studentName.trim(); if (!name) return; const { error } = await supabase.from('mathlens_students').upsert({ session_id: sessionId, student_id: studentId, name, group_name: 'Equipo azul' }, { onConflict: 'session_id,student_id' }); if (!error) setJoined(true) }
  const copySession = async () => { await navigator.clipboard?.writeText(sessionId); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const answer = async (choice: number) => { if (answered !== null) return; setAnswered(choice); const correct = choice === active.trivia.answer; if (correct) { setScore(s => s + 100); setStreak(s => s + 1) } else setStreak(0); if (joined) { const current = students.find(s => s.id === studentId); await supabase.from('mathlens_students').update({ score: (current?.score ?? score) + (correct ? 100 : 0), streak: correct ? (current?.streak ?? streak) + 1 : 0, answered_current_round: true, last_answer_correct: correct }).eq('session_id', sessionId).eq('student_id', studentId) } }
  const next = () => { const done = [...new Set([...completed, active.id])]; setCompleted(done); localStorage.setItem('mathlens-completed', JSON.stringify(done)); setAnswered(null); setModal(false); setIndex(i => i + 1) }
  const selectLevel = (nextLevel: Difficulty) => { setLevel(nextLevel); setIndex(0); setAnswered(null) }

  return <main className="min-h-dvh bg-background text-foreground selection:bg-primary/30">
    <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 md:px-8">
      <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="size-4" /></div><div><p className="font-mono text-xs font-bold tracking-[0.2em] text-primary">MATHLENS</p><p className="hidden text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:block">Explora. Conecta. Comprende.</p></div></div>
      <div className="flex items-center gap-3"><div className="flex items-center gap-1.5 rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1.5 text-xs text-orange-200"><Flame className="size-3.5" /> {streak} racha</div><div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary"><Trophy className="size-3.5" /> {score.toString().padStart(4, '0')}</div></div>
    </header>
    <section className="flex flex-col gap-3 border-b border-border/50 bg-card/40 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8"><div className="flex items-center gap-3"><div className="flex items-center gap-2 text-xs text-primary"><Radio className="size-3.5" /> Sesión en vivo</div><span className="font-mono text-xs text-muted-foreground">{sessionId}</span><button onClick={copySession} className="text-muted-foreground transition hover:text-primary" aria-label="Copiar código de sesión">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button></div>{joined ? <p className="text-xs text-muted-foreground">Conectado como <span className="font-semibold text-foreground">{studentName}</span></p> : <form onSubmit={e => { e.preventDefault(); joinClass() }} className="flex gap-2"><input value={studentName} onChange={e => setStudentName(e.target.value)} aria-label="Tu nombre" placeholder="Tu nombre" className="w-36 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-primary" /><button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Unirme</button></form>}</section>
    <section className="flex flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Laboratorio de superficies · Nivel {index + 1}/2</p><h1 className="text-balance text-2xl font-semibold tracking-tight md:text-4xl">Dominios y superficies</h1></div><div className="flex gap-2">{levels.map(l => { const locked = l.label !== 'Fácil' && !completed.includes('paraboloid'); return <button key={l.label} disabled={locked} onClick={() => selectLevel(l.label)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${level === l.label ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'} ${locked ? 'cursor-not-allowed opacity-40' : 'hover:border-primary/40'}`}>{locked ? <LockKeyhole className="size-3" /> : l.label}<span className="font-mono opacity-60">{l.count}</span></button> })}</div></div>
      <div className="relative min-h-[470px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/30"><div className="absolute inset-0"><Scene active={active} k={k} /></div><div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2"><span className="rounded-full border border-primary/30 bg-background/80 px-3 py-1.5 font-mono text-xs text-primary backdrop-blur">{active.expression.replaceAll('*', ' · ')}</span><span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">corte z = {k.toFixed(1)}</span></div><div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-border/70 bg-background/75 px-3 py-2 text-[10px] text-muted-foreground backdrop-blur"><Gauge className="size-3 text-primary" /> arrastra para orbitar · scroll para zoom</div>
        <div className={`absolute right-3 top-3 z-10 w-[min(320px,calc(100%-24px))] rounded-xl border border-border/80 bg-background/90 shadow-xl backdrop-blur-xl ${open ? 'p-4' : 'p-2'}`}><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}><span className="flex items-center gap-2 text-xs font-semibold"><span className="size-2 rounded-full bg-primary" /> Insight <span className="font-mono text-[10px] text-muted-foreground">/{active.title}</span></span>{open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}</button>{open && <div className="mt-4 flex flex-col gap-4"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Función activa</p><p className="mt-1 font-mono text-lg text-primary">z = {active.expression}</p></div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-secondary/60 p-2.5"><p className="text-[10px] text-muted-foreground">Dominio</p><p className="mt-1 text-xs leading-relaxed">{active.domain}</p></div><div className="rounded-lg bg-secondary/60 p-2.5"><p className="text-[10px] text-muted-foreground">Rango</p><p className="mt-1 text-xs leading-relaxed">{active.range}</p></div></div><p className="text-xs leading-relaxed text-muted-foreground">{active.hint}</p><label className="flex flex-col gap-2"><span className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Plano de corte</span><span className="font-mono text-primary">k = {k.toFixed(1)}</span></span><input aria-label="Altura del plano de corte" type="range" min="-5" max="8" step="0.1" value={k} onChange={e => setK(Number(e.target.value))} className="accent-primary" /></label><div className="flex items-center gap-2 text-[10px] text-orange-200"><span className="size-2 rounded-full bg-orange-300" /> curva de nivel real</div></div>}</div></div>
      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3 sm:flex-row"><div className="flex items-center gap-3"><div className="flex gap-1">{[0, 1].map(i => <span key={i} className={`size-2 rounded-full ${i <= index ? 'bg-primary' : 'bg-muted'}`} />)}</div><p className="text-xs text-muted-foreground">Responde la pregunta para desbloquear la siguiente superficie.</p></div><button onClick={() => setModal(true)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 sm:w-auto"><CircleHelp className="size-4" /> Abrir trivia</button></div>
    </section>
    {students.length > 0 && <section className="mx-4 mb-6 rounded-xl border border-border/70 bg-card/60 p-4 md:mx-8"><div className="mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="text-sm font-semibold">Actividad del aula</h2><span className="ml-auto font-mono text-[10px] text-muted-foreground">{students.length} conectados</span></div><div className="flex flex-wrap gap-2">{students.slice(0, 8).map((student, i) => <div key={student.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"><span className="font-mono text-primary">0{i + 1}</span><span>{student.name}</span><span className="font-mono text-muted-foreground">{student.score} pts</span></div>)}</div></section>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Comprobación rápida</p><h2 className="mt-2 text-xl font-semibold text-balance">{active.trivia.question}</h2></div><button aria-label="Cerrar trivia" onClick={() => setModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><X className="size-5" /></button></div><div className="mt-5 flex flex-col gap-2">{active.trivia.options.map((option, i) => <button key={option} onClick={() => answer(i)} className={`rounded-xl border p-3 text-left text-sm transition ${answered === null ? 'border-border hover:border-primary/50 hover:bg-primary/5' : i === active.trivia.answer ? 'border-primary bg-primary/10 text-primary' : answered === i ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border opacity-50'}`}><span className="mr-3 font-mono text-xs text-muted-foreground">0{i + 1}</span>{option}</button>)}</div>{answered !== null && <div className="mt-4 rounded-xl bg-secondary/60 p-3"><p className={`text-xs font-semibold ${answered === active.trivia.answer ? 'text-primary' : 'text-destructive'}`}>{answered === active.trivia.answer ? 'Correcto · +100 puntos' : 'Casi. Observa la restricción.'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{active.trivia.explanation}</p></div>}{answered !== null && <button onClick={next} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground">{index === 1 ? 'Completar nivel' : 'Siguiente superficie'} <ChevronDown className="size-4 -rotate-90" /></button>}</div></div>}
  </main>
}
