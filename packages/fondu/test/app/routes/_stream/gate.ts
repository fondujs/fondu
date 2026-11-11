// a boundary's data for the tests: it arrives when the test says so (no timers to race)
let open!: () => void
let opened: Promise<void> = Promise.resolve()
/** the next boundary waits until `release()` */
export const arm = () => {
  opened = new Promise<void>((resolve) => (open = resolve))
}
export const release = () => open()
export const current = () => opened
