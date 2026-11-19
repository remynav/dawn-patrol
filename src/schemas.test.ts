import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from './schemas'

describe('schemas', () => {
  it('pass the DeepSpace schema linter with no warnings', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  it('keep every Dawn Patrol collection closed to signed-out visitors and viewers', () => {
    for (const name of ['spots', 'calls', 'sessions', 'rsvps']) {
      const schema = schemas.find((s) => s.name === name)!
      expect(schema.permissions['*']).toBeUndefined()
      expect(schema.permissions.viewer).toEqual({ read: false, create: false, update: false, delete: false })
    }
  })

  it('let only the admin write spots, and nobody write calls or sessions from the browser', () => {
    const perms = (name: string) => schemas.find((s) => s.name === name)!.permissions
    expect(perms('spots').member).toEqual({ read: true, create: false, update: false, delete: false })
    expect(perms('spots').admin).toEqual({ read: true, create: true, update: true, delete: true })
    for (const name of ['calls', 'sessions']) {
      for (const role of ['member', 'admin']) {
        expect(perms(name)[role]).toEqual({ read: true, create: false, update: false, delete: false })
      }
    }
  })
})
