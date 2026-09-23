import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let args = CommandLine.arguments
let src = URL(fileURLWithPath: args[1]); let dst = URL(fileURLWithPath: args[2])
let innerR = Double(args[3])!   // radius of the badge's inner white disc in source px
let targetR = Double(args[4])!  // radius that disc should get in the 1024 output
let S = 1024
let img = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(src as CFURL, nil)!, 0, nil)!
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: S, height: S))
ctx.saveGState()
let c = CGFloat(S) / 2
ctx.addEllipse(in: CGRect(x: c - targetR, y: c - targetR, width: 2 * targetR, height: 2 * targetR)); ctx.clip()
let scale = targetR / innerR
let w = CGFloat(img.width) * scale, h = CGFloat(img.height) * scale
ctx.interpolationQuality = .high
ctx.draw(img, in: CGRect(x: c - w / 2, y: c - h / 2, width: w, height: h))
ctx.restoreGState()
let out = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(dst as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, out, nil); CGImageDestinationFinalize(dest)
print("ok")
