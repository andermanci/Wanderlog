// ical.js 1.5 no publica tipos. Declaramos solo lo que usa parseIcs.ts.
declare module 'ical.js' {
  export interface Time {
    toJSDate(): Date
    /** true si el VEVENT es de día completo (DATE, sin hora). */
    isDate: boolean
  }

  export class Component {
    constructor(jCal: unknown)
    getAllSubcomponents(name: string): Component[]
  }

  export class Event {
    constructor(component: Component)
    uid: string
    summary: string
    description: string
    location: string
    startDate: Time | null
    endDate: Time | null
  }

  export function parse(input: string): unknown
}
