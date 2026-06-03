'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

const ANALYSIS_STEPS = [
  { label: 'Validating structure', delay: 0 },
  { label: 'Computing descriptors', delay: 5000 },
  { label: 'Running toxicity model', delay: 20000 },
  { label: 'Generating report', delay: 65000 },
]

interface AnalysisProgressProps {
  isLoading: boolean
  startTime: number | null
}

export function AnalysisProgress({
  isLoading,
  startTime,
}: AnalysisProgressProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progressValue, setProgressValue] = useState(0)

  useEffect(() => {
    if (!isLoading || !startTime) {
      setCurrentStep(0)
      setProgressValue(0)
      return
    }

    const updateProgress = () => {
      const elapsed = Date.now() - startTime

      let step = 0
      for (let i = ANALYSIS_STEPS.length - 1; i >= 0; i--) {
        if (elapsed >= ANALYSIS_STEPS[i].delay) {
          step = i
          break
        }
      }
      setCurrentStep(step)

      const totalDuration = 90000
      const progress = Math.min((elapsed / totalDuration) * 95, 95)
      setProgressValue(progress)
    }

    updateProgress()
    const interval = setInterval(updateProgress, 500)

    return () => clearInterval(interval)
  }, [isLoading, startTime])

  if (!isLoading) return null

  return (
    <div className="space-y-6">
      {/* Section label with red accent */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-0.5 bg-accent" />
        <span className="text-xs font-medium tracking-widest uppercase text-accent">
          Analysis Progress
        </span>
      </div>

      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="h-1 bg-border overflow-hidden">
          <div 
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progressValue}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progressValue.toFixed(0)}% complete</span>
          <span>~90 sec total</span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {ANALYSIS_STEPS.map((step, index) => {
          const isCompleted = index < currentStep
          const isActive = index === currentStep
          const isPending = index > currentStep

          return (
            <div key={step.label} className="flex items-center gap-3">
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 text-accent animate-spin shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-border shrink-0" />
              )}
              <span
                className={cn(
                  'text-sm transition-colors',
                  isCompleted && 'text-muted-foreground',
                  isActive && 'text-foreground font-medium',
                  isPending && 'text-muted-foreground/50'
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
