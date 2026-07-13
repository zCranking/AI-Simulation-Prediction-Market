import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 7,
          background: 'linear-gradient(to bottom right, #f59e0b, #4f46e5)',
          color: 'white',
          fontSize: 14,
          fontWeight: 900,
          fontFamily: 'sans-serif',
        }}
      >
        AI
      </div>
    ),
    size
  )
}
