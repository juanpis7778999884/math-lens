import { compile } from 'mathjs'

export type Difficulty = 'Fácil' | 'Medio' | 'Difícil'
export type MathFunction = {
  id: string
  title: string
  expression: string
  difficulty: Difficulty
  domain: string
  range: string
  hint: string
  color: string
  trivia: { question: string; options: string[]; answer: number; explanation: string }
}

export const functions: MathFunction[] = [
  { id: 'paraboloid', title: 'Paraboloide', expression: 'x^2 + y^2', difficulty: 'Fácil', domain: 'Todos los reales · ℝ²', range: '[0, ∞)', hint: 'Una cuenca simétrica: el mínimo vive en el origen.', color: '#44e0d1', trivia: { question: '¿Cuál es el rango de z = x² + y²?', options: ['ℝ', '[0, ∞)', '(-∞, 0]'], answer: 1, explanation: 'Una suma de cuadrados nunca puede ser negativa.' } },
  { id: 'saddle', title: 'Silla de montar', expression: 'x * y', difficulty: 'Fácil', domain: 'Todos los reales · ℝ²', range: 'Todos los reales · ℝ', hint: 'Dos diagonales cruzan el origen y cambian la pendiente.', color: '#a78bfa', trivia: { question: '¿Qué valores puede tomar z = xy?', options: ['Solo positivos', 'Solo negativos', 'Todos los reales'], answer: 2, explanation: 'Al variar x e y, el producto puede alcanzar cualquier valor real.' } },
  { id: 'dome', title: 'Cúpula', expression: 'sqrt(4 - x^2 - y^2)', difficulty: 'Medio', domain: 'Disco x² + y² ≤ 4', range: '[0, 2]', hint: 'El dominio se cierra en un círculo de radio 2.', color: '#67e8f9', trivia: { question: '¿Qué región pertenece al dominio?', options: ['Un disco de radio 2', 'Todo ℝ²', 'Una banda vertical'], answer: 0, explanation: 'El radicando debe ser mayor o igual que cero.' } },
  { id: 'log', title: 'Logaritmo', expression: 'log(x + y)', difficulty: 'Medio', domain: 'Semiplano x + y > 0', range: 'Todos los reales · ℝ', hint: 'La frontera x + y = 0 es una asíntota vertical.', color: '#fbbf24', trivia: { question: '¿Qué condición necesita ln(x + y)?', options: ['x + y ≥ 0', 'x + y > 0', 'x + y < 0'], answer: 1, explanation: 'El argumento de un logaritmo debe ser estrictamente positivo.' } },
  { id: 'well', title: 'Pozo singular', expression: '1 / (x^2 + y^2)', difficulty: 'Difícil', domain: 'ℝ² excepto (0, 0)', range: '(0, ∞)', hint: 'El origen está excluido: el valor crece sin límite cerca de él.', color: '#fb7185', trivia: { question: '¿Qué punto está fuera del dominio?', options: ['(1, 1)', '(0, 0)', '(-2, 1)'], answer: 1, explanation: 'El denominador se hace cero en el origen.' } },
  { id: 'radical', title: 'Ruptura radical', expression: 'sqrt(x^2 + y^2 - 4) / (x - y)', difficulty: 'Difícil', domain: 'Exterior del círculo r ≥ 2; x ≠ y', range: 'Variable · discontinuo', hint: 'Hay dos restricciones: el radicando y la diagonal x = y.', color: '#c084fc', trivia: { question: '¿Qué dos restricciones aparecen?', options: ['Raíz y denominador', 'Solo una raíz', 'Ninguna'], answer: 0, explanation: 'La raíz exige r² ≥ 4 y el denominador exige x − y ≠ 0.' } },
]

export function evaluateExpression(expression: string, x: number, y: number) {
  try {
    const value = compile(expression).evaluate({ x, y })
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch { return null }
}

export function sampleSurface(expression: string, size = 18, span = 3.2) {
  const positions: number[] = [], colors: number[] = [], valid: boolean[] = []
  for (let iy = 0; iy <= size; iy++) for (let ix = 0; ix <= size; ix++) {
    const x = -span + (ix / size) * span * 2, y = -span + (iy / size) * span * 2
    const z = evaluateExpression(expression, x, y)
    const okay = z !== null && Math.abs(z) < 12
    positions.push(x, y, okay ? z! * 0.42 : 0)
    valid.push(okay)
    const t = okay ? Math.min(1, Math.abs(z!) / 7) : 0
    colors.push(okay ? 0.18 + t * 0.15 : 0.55, okay ? 0.8 - t * 0.25 : 0.12, okay ? 0.78 + (1 - t) * 0.18 : 0.18)
  }
  const indices: number[] = []
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const a = y*(size+1)+x; indices.push(a,a+1,a+size+1,a+1,a+size+2,a+size+1) }
  return { positions, colors, indices, valid }
}

export function intersectionCurve(expression: string, k: number) {
  const points: number[] = []
  for (let i = 0; i < 160; i++) { const x = -3.1 + (i / 159) * 6.2; let lastY = -3.1; let last = evaluateExpression(expression, x, lastY); for (let j = 1; j <= 70; j++) { const y = -3.1 + (j/70)*6.2, v = evaluateExpression(expression,x,y); if (last !== null && v !== null && (last-k)*(v-k) <= 0) { points.push(x, y, k*0.42 + 0.02) ; break }; last=v; lastY=y } }
  return points
}
