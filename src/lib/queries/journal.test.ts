import { describe, it, expect } from 'vitest'
import { photoExtension } from './journal'

// La extensión sale del blob YA comprimido, no del nombre original: una foto que
// entra como .jpg sale como .webp, y si el path no lo refleja el navegador se
// come una imagen con extensión mentida (y el bucket, un content-type raro).
describe('photoExtension', () => {
  it('manda el tipo del blob comprimido, no el nombre del original', () => {
    expect(photoExtension('image/webp', 'IMG_0042.jpg')).toBe('webp')
    expect(photoExtension('image/jpeg', 'captura.png')).toBe('jpg')
    expect(photoExtension('image/png', 'algo.jpeg')).toBe('png')
  })

  it('si el tipo no dice nada, tira del nombre del fichero', () => {
    expect(photoExtension('', 'foto.HEIC')).toBe('HEIC')
    expect(photoExtension('image/heic', 'foto.heic')).toBe('heic')
  })

  it('nunca deja el path acabado en ".undefined" (fotos sin extensión)', () => {
    expect(photoExtension('', 'imagen')).toBe('jpg')
    expect(photoExtension('', '')).toBe('jpg')
  })
})
