import { describe, it, expect } from 'vitest'
import { parseInput } from '../lib/parse.js'

describe('parseInput', () => {
  describe('plain component name', () => {
    it('returns lowercase component name', () => {
      expect(parseInput('button')).toEqual({ componentName: 'button' })
    })

    it('lowercases input', () => {
      expect(parseInput('Button')).toEqual({ componentName: 'button' })
    })

    it('handles multi-word names', () => {
      expect(parseInput('auth')).toEqual({ componentName: 'auth' })
    })
  })

  describe('slash syntax (theme/component)', () => {
    it('parses theme/component', () => {
      expect(parseInput('aloha/button')).toEqual({
        componentName: 'button',
        themeSlug: 'aloha',
      })
    })

    it('lowercases both parts', () => {
      expect(parseInput('ALOHA/Button')).toEqual({
        componentName: 'button',
        themeSlug: 'aloha',
      })
    })

    it('handles multi-segment component paths', () => {
      expect(parseInput('aloha/ui/button')).toEqual({
        componentName: 'ui/button',
        themeSlug: 'aloha',
      })
    })
  })

  describe('dash syntax (theme-component)', () => {
    it('parses theme-component when theme is in known list', () => {
      const themes = ['aloha', 'retro', 'solar']
      expect(parseInput('aloha-button', undefined, themes)).toEqual({
        componentName: 'button',
        themeSlug: 'aloha',
      })
    })

    it('does not split when theme is not in known list', () => {
      const themes = ['retro', 'solar']
      expect(parseInput('aloha-button', undefined, themes)).toEqual({
        componentName: 'aloha-button',
      })
    })

    it('does not split when no known themes provided', () => {
      expect(parseInput('aloha-button')).toEqual({
        componentName: 'aloha-button',
      })
    })

    it('does not split if component name would be empty', () => {
      const themes = ['aloha']
      // "aloha-" has an empty component part after stripping the theme prefix
      // Actually "aloha-" → componentName = "" which is falsy, so it falls through
      expect(parseInput('aloha-', undefined, themes)).toEqual({
        componentName: 'aloha-',
      })
    })

    it('matches the longest theme prefix when themes overlap', () => {
      const themes = ['solar', 'solar-dark']
      // "solar-dark-button" should match "solar-dark" (longer), not "solar"
      expect(parseInput('solar-dark-button', undefined, themes)).toEqual({
        componentName: 'button',
        themeSlug: 'solar-dark',
      })
    })

    it('matches shorter theme when longer does not apply', () => {
      const themes = ['solar', 'solar-dark']
      expect(parseInput('solar-button', undefined, themes)).toEqual({
        componentName: 'button',
        themeSlug: 'solar',
      })
    })
  })

  describe('--theme flag priority', () => {
    it('uses --theme flag over slash syntax', () => {
      expect(parseInput('retro/button', 'aloha')).toEqual({
        componentName: 'retro/button',
        themeSlug: 'aloha',
      })
    })

    it('uses --theme flag over dash syntax', () => {
      const themes = ['retro']
      expect(parseInput('retro-button', 'aloha', themes)).toEqual({
        componentName: 'retro-button',
        themeSlug: 'aloha',
      })
    })

    it('lowercases the theme flag', () => {
      expect(parseInput('button', 'ALOHA')).toEqual({
        componentName: 'button',
        themeSlug: 'aloha',
      })
    })
  })
})
