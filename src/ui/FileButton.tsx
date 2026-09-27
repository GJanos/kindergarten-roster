import { useRef, type ReactNode } from 'react'

/** A normal big button that opens the file picker. */
export function FileButton(props: {
  accept: string
  onFile: (file: File) => void
  className?: string
  children: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className={props.className} onClick={() => input.current?.click()}>
        {props.children}
      </button>
      <input
        ref={input}
        type="file"
        accept={props.accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) props.onFile(file)
        }}
      />
    </>
  )
}
