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
  speakerAnalyserRef?: React.MutableRefObject<AnalyserNode | null>
  isMuted?: boolean
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  onClick,
  size = 280,
  theme = 'cloud',
  volume,
  analyserRef,
  speakerAnalyserRef,
  isMuted = false
}) => {
  // Self-contained 60fps volume state: completely isolates animation re-renders from root App
  const [internalVolume, setInternalVolume] = useState<number>(0)
  const [frequencyBars, setFrequencyBars] = useState<number[]>([4, 4, 4, 4, 4, 4, 4])

  useEffect(() => {
    let animId: number
    const bufferLength = 128
    const dataArray = new Uint8Array(bufferLength)
    let smoothedVolume = 0

    // 7 key audio frequency bands (sub-bass, bass, low-mid, mid, high-mid, presence, brilliance)
    const bandIndices = [2, 6, 12, 22, 36, 54, 76]

    const step = () => {
      if (state === 'speaking') {
        if (speakerAnalyserRef?.current) {
          speakerAnalyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]
          }
          const avg = sum / bufferLength

          // Frame-accurate reactive volume envelope derived directly from speech frequency spectrum
          const target = avg > 3 ? Math.min(1.0, 0.22 + Math.pow(avg / 100, 0.8) * 0.78) : 0.06
          smoothedVolume = smoothedVolume * 0.55 + target * 0.45
          setInternalVolume(smoothedVolume)

          // Live audio graphic equalizer bars based on real frequency bands
          const bars = bandIndices.map(idx => {
            const val = dataArray[idx] || 0
            return Math.max(4, Math.round((val / 255) * 26 + 4))
          })
          setFrequencyBars(bars)
        } else {
          // Natural human speech cadence envelope fallback if no speaker analyser attached
          const now = performance.now() / 1000
          const syllabicBurst = Math.sin(now * 16) * 0.32 + Math.sin(now * 28) * 0.2 + Math.cos(now * 8) * 0.15
          const vol = Math.max(0.18, Math.min(1.0, 0.68 + syllabicBurst))
          setInternalVolume(vol)
          setFrequencyBars([0.6, 0.9, 0.4, 1.0, 0.7, 0.95, 0.5].map(f => Math.max(4, Math.round(f * (vol * 24 + 6)))))
        }
      } else if (state === 'listening') {
        if (analyserRef?.current && !isMuted) {
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]
          }
          const avg = sum / bufferLength
          const target = avg > 8 ? Math.min(1.0, Math.pow((avg - 8) / 48, 0.8)) : 0.04
          smoothedVolume = smoothedVolume * 0.65 + target * 0.35
          setInternalVolume(smoothedVolume)

          // Live microphone acoustic bars
          const bars = bandIndices.map(idx => {
            const val = dataArray[idx] || 0
            return Math.max(4, Math.round((val / 255) * 26 + 4))
          })
          setFrequencyBars(bars)
        } else {
          // Gentle ambient breathing pulse while listening
          const now = performance.now() / 1000
          const vol = 0.4 + Math.sin(now * 8) * 0.2
          setInternalVolume(vol)
          setFrequencyBars([4, 6, 8, 10, 8, 6, 4])
        }
      } else if (state === 'thinking') {
        const now = performance.now() / 1000
        setInternalVolume(0.5 + Math.sin(now * 12) * 0.25)
        setFrequencyBars([6, 12, 18, 22, 18, 12, 6].map(h => Math.round(h * (0.8 + Math.sin(now * 10) * 0.2))))
      } else {
        setInternalVolume(0)
        setFrequencyBars([4, 4, 4, 4, 4, 4, 4])
      }
      animId = requestAnimationFrame(step)
    }

    if (state === 'speaking' || state === 'listening' || state === 'thinking') {
      animId = requestAnimationFrame(step)
    } else {
      setInternalVolume(0)
      setFrequencyBars([4, 4, 4, 4, 4, 4, 4])
    }

    return () => cancelAnimationFrame(animId)
  }, [state, isMuted, analyserRef, speakerAnalyserRef])

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
      {(state === 'speaking' || state === 'listening' || state === 'thinking') && (
        <div className="orb-waveform-indicator">
          {frequencyBars.map((barHeight, idx) => (
            <span 
              key={idx} 
              className="waveform-bar"
              style={{
                height: `${barHeight}px`,
                transition: 'height 0.05s ease'
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
