import React, { useState, useEffect } from 'react'
import { Orb } from 'orb-ui'
import type { OrbThemeName, OrbState } from 'orb-ui'

interface VoiceOrbProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'connecting' | 'error'
  onClick?: () => void
  size?: number
  theme?: OrbThemeName
  volume?: number
  analyserRef?: React.MutableRefObject<AnalyserNode | null>
  isMuted?: boolean
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  onClick,
  size = 280,
  theme = 'cloud',
  volume,
  analyserRef,
  isMuted = false
}) => {
  // Self-contained 60fps volume state: completely isolates animation re-renders from root App
  const [internalVolume, setInternalVolume] = useState<number>(0)

  useEffect(() => {
    let animId: number
    const bufferLength = 128
    const dataArray = new Uint8Array(bufferLength)
    let smoothedMic = 0

    const step = () => {
      if (state === 'speaking') {
        // Natural human speech cadence envelope (syllabic bursts & micro-pauses)
        const now = performance.now() / 1000
        const syllabicBurst = Math.sin(now * 16) * 0.32 + Math.sin(now * 28) * 0.2 + Math.cos(now * 8) * 0.15
        setInternalVolume(Math.max(0.18, Math.min(1.0, 0.68 + syllabicBurst)))
      } else if (state === 'listening') {
        if (analyserRef?.current && !isMuted) {
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]
          }
          const avg = sum / bufferLength
          const target = avg > 8 ? Math.min(1.0, Math.pow((avg - 8) / 48, 0.8)) : 0.04
          smoothedMic = smoothedMic * 0.65 + target * 0.35
          setInternalVolume(smoothedMic)
        } else {
          // Gentle ambient breathing pulse while listening
          const now = performance.now() / 1000
          setInternalVolume(0.4 + Math.sin(now * 8) * 0.2)
        }
      } else if (state === 'thinking') {
        const now = performance.now() / 1000
        setInternalVolume(0.5 + Math.sin(now * 12) * 0.25)
      } else {
        setInternalVolume(0)
      }
      animId = requestAnimationFrame(step)
    }

    if (state === 'speaking' || state === 'listening' || state === 'thinking') {
      animId = requestAnimationFrame(step)
    } else {
      setInternalVolume(0)
    }

    return () => cancelAnimationFrame(animId)
  }, [state, isMuted, analyserRef])

  // Normalize state to official OrbState
  const mappedState: OrbState = 
    state === 'thinking' ? 'thinking' 
    : state === 'listening' ? 'listening' 
    : state === 'speaking' ? 'speaking' 
    : state === 'connecting' ? 'connecting'
    : state === 'error' ? 'error'
    : 'idle'

  // Priority: explicit external volume if supplied, otherwise isolated internal volume
  const rawVol = (volume !== undefined && volume > 0) ? volume : internalVolume
  const effectiveVolume = Math.max(0, Math.min(1, rawVol))
  const scaleMultiplier = 1 + (effectiveVolume * 0.22)
  const auraGlowOpacity = state === 'idle' ? 0.35 : 0.55 + (effectiveVolume * 0.45)
  const auraSize = size * 1.25

  return (
    <div 
      className={`official-orb-stage state-${state}`}
      onClick={onClick}
      style={{
        width: auraSize,
        height: auraSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        margin: '0 auto',
        userSelect: 'none'
      }}
      title="Tap orb to speak or interrupt"
    >
      {/* 1. Deep Multi-layered Ambient Reactive Aura */}
      <div 
        className="orb-reactive-aura"
        style={{
          width: size * 1.05,
          height: size * 1.05,
          transform: `scale(${scaleMultiplier})`,
          opacity: auraGlowOpacity,
          transition: 'transform 0.08s cubic-bezier(0.2, 0.8, 0.4, 1), opacity 0.15s ease'
        }}
      />

      {/* 2. Concentric Audio Ripple Wave Rings (Pulsing when speaking or listening) */}
      {(state === 'speaking' || state === 'listening' || state === 'thinking') && (
        <>
          <div 
            className="orb-sonic-ring ring-1"
            style={{
              width: size * 1.15,
              height: size * 1.15,
              transform: `scale(${1 + effectiveVolume * 0.25})`,
              opacity: 0.2 + effectiveVolume * 0.45
            }}
          />
          <div 
            className="orb-sonic-ring ring-2"
            style={{
              width: size * 1.3,
              height: size * 1.3,
              transform: `scale(${1 + effectiveVolume * 0.35})`,
              opacity: 0.12 + effectiveVolume * 0.35
            }}
          />
          <div 
            className="orb-sonic-ring ring-3"
            style={{
              width: size * 1.48,
              height: size * 1.48,
              transform: `scale(${1 + effectiveVolume * 0.48})`,
              opacity: 0.06 + effectiveVolume * 0.25
            }}
          />
        </>
      )}

      {/* 3. Core Official Orb from orb-ui */}
      <div 
        className="orb-core-container"
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${scaleMultiplier})`,
          transition: 'transform 0.08s cubic-bezier(0.2, 0.8, 0.4, 1)'
        }}
      >
        <Orb 
          state={mappedState}
          theme={theme}
          size={size}
          signal={{
            state: mappedState,
            inputVolume: mappedState === 'listening' ? Math.max(0.2, effectiveVolume) : 0,
            outputVolume: mappedState === 'speaking' ? Math.max(0.3, effectiveVolume) : 0
          }}
          interactive={false}
        />
      </div>

      {/* 4. Live Audio Waveform Bars underneath */}
      {(state === 'speaking' || state === 'listening') && (
        <div className="orb-waveform-indicator">
          {[0.6, 0.9, 0.4, 1.0, 0.7, 0.95, 0.5].map((factor, idx) => {
            const barHeight = Math.max(4, Math.round(factor * (effectiveVolume * 24 + 6)))
            return (
              <span 
                key={idx} 
                className="waveform-bar"
                style={{
                  height: `${barHeight}px`,
                  transition: 'height 0.07s ease'
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
