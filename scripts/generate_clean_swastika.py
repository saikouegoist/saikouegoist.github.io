import os
import math
from PIL import Image, ImageDraw

def create_hindu_swastika():
    # Base canvas size: 240x240 for 2x super-sampling down to 120x120
    size = 240
    cx, cy = size // 2, size // 2
    L = 72       # length of central half-arm
    hook = 58    # length of bent hook
    sw = 16      # stroke width
    dot_r = 10   # bindu dot radius
    dot_dist = 42 # distance of bindus from center
    
    # Auspicious colors
    # Vermillion Red / Kumkum: #dc2626 -> (220, 38, 38)
    # Sacred Saffron Gold accents: #f59e0b -> (245, 158, 11)
    # Deep Sacred Red: #991b1b -> (153, 27, 27)
    
    num_frames = 16
    frames = []
    
    for f in range(num_frames):
        # Progress 0 to 1
        t = f / num_frames
        pulse = math.sin(t * 2 * math.pi)
        
        # Subtle divine gold shimmer breathing
        # Color cycles between vibrant sacred vermillion and auspicious golden vermillion
        r = int(220 + 25 * pulse)
        g = int(32 + 30 * (pulse * 0.5 + 0.5))
        b = int(25 + 10 * pulse)
        stroke_color = (r, g, b, 255)
        
        # Gold highlight on lines and bindus
        gold_glow = int(180 + 75 * math.sin(t * 2 * math.pi + math.pi / 4))
        highlight_color = (255, gold_glow, 40, 255)
        
        # Create transparent RGBA image
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Draw soft outer aura (transparent glow)
        glow_radius = sw // 2 + 4 + int(2 * (pulse * 0.5 + 0.5))
        for g_offset in range(glow_radius, 0, -2):
            alpha = int(25 * (1.0 - g_offset / glow_radius) * (0.6 + 0.4 * (pulse * 0.5 + 0.5)))
            glow_c = (245, 160, 20, alpha)
            cur_w = sw + g_offset * 2
            
            # Vertical central arm
            draw.line([(cx, cy - L), (cx, cy + L)], fill=glow_c, width=cur_w)
            # Horizontal central arm
            draw.line([(cx - L, cy), (cx + L, cy)], fill=glow_c, width=cur_w)
            # Top arm hook (going right)
            draw.line([(cx, cy - L), (cx + hook, cy - L)], fill=glow_c, width=cur_w)
            # Right arm hook (going down)
            draw.line([(cx + L, cy), (cx + L, cy + hook)], fill=glow_c, width=cur_w)
            # Bottom arm hook (going left)
            draw.line([(cx, cy + L), (cx - hook, cy + L)], fill=glow_c, width=cur_w)
            # Left arm hook (going up)
            draw.line([(cx - L, cy), (cx - L, cy - hook)], fill=glow_c, width=cur_w)
            
            # Dots glow
            cur_dr = dot_r + g_offset
            for dx, dy in [(-dot_dist, -dot_dist), (dot_dist, -dot_dist), 
                           (-dot_dist, dot_dist), (dot_dist, dot_dist)]:
                draw.ellipse([(cx + dx - cur_dr, cy + dy - cur_dr), 
                              (cx + dx + cur_dr, cy + dy + cur_dr)], fill=glow_c)
        
        # Main Swastika Lines (Sacred Vermillion)
        # 1. Central vertical bar
        draw.line([(cx, cy - L), (cx, cy + L)], fill=stroke_color, width=sw)
        # 2. Central horizontal bar
        draw.line([(cx - L, cy), (cx + L, cy)], fill=stroke_color, width=sw)
        # 3. Top arm bent clockwise (right)
        draw.line([(cx, cy - L), (cx + hook, cy - L)], fill=stroke_color, width=sw)
        # 4. Right arm bent clockwise (down)
        draw.line([(cx + L, cy), (cx + L, cy + hook)], fill=stroke_color, width=sw)
        # 5. Bottom arm bent clockwise (left)
        draw.line([(cx, cy + L), (cx - hook, cy + L)], fill=stroke_color, width=sw)
        # 6. Left arm bent clockwise (up)
        draw.line([(cx - L, cy), (cx - L, cy - hook)], fill=stroke_color, width=sw)
        
        # Rounded caps and corners for clean aesthetic
        cap_r = sw // 2
        endpoints = [
            (cx, cy),
            (cx, cy - L), (cx + hook, cy - L),
            (cx + L, cy), (cx + L, cy + hook),
            (cx, cy + L), (cx - hook, cy + L),
            (cx - L, cy), (cx - L, cy - hook),
        ]
        for ep_x, ep_y in endpoints:
            draw.ellipse([(ep_x - cap_r, ep_y - cap_r), (ep_x + cap_r, ep_y + cap_r)], fill=stroke_color)
            
        # Subtle golden core line for consecrated shimmer
        core_w = max(2, sw // 4)
        c_glow = int(160 + 95 * (pulse * 0.5 + 0.5))
        core_c = (255, c_glow, 60, 220)
        draw.line([(cx, cy - L + cap_r), (cx, cy + L - cap_r)], fill=core_c, width=core_w)
        draw.line([(cx - L + cap_r, cy), (cx + L - cap_r, cy)], fill=core_c, width=core_w)
        draw.line([(cx, cy - L), (cx + hook - cap_r, cy - L)], fill=core_c, width=core_w)
        draw.line([(cx + L, cy), (cx + L, cy + hook - cap_r)], fill=core_c, width=core_w)
        draw.line([(cx, cy + L), (cx - hook + cap_r, cy + L)], fill=core_c, width=core_w)
        draw.line([(cx - L, cy), (cx - L, cy - hook + cap_r)], fill=core_c, width=core_w)

        # 4 Sacred Bindu Dots (One in each quadrant)
        bindu_pulse = dot_r + int(1.5 * pulse)
        for dx, dy in [(-dot_dist, -dot_dist), (dot_dist, -dot_dist), 
                       (-dot_dist, dot_dist), (dot_dist, dot_dist)]:
            # Outer vermillion bindu
            draw.ellipse([(cx + dx - bindu_pulse, cy + dy - bindu_pulse),
                          (cx + dx + bindu_pulse, cy + dy + bindu_pulse)], fill=stroke_color)
            # Inner golden seed bindu
            inner_r = max(2, bindu_pulse // 2)
            draw.ellipse([(cx + dx - inner_r, cy + dy - inner_r),
                          (cx + dx + inner_r, cy + dy + inner_r)], fill=highlight_color)

        # Downsample to target size 100x100 for crisp anti-aliasing
        target_size = (100, 100)
        resized = img.resize(target_size, Image.Resampling.LANCZOS)
        frames.append(resized)
        
    return frames

def save_transparent_gif(frames, out_path, duration=70):
    # Process frames for true GIF transparency without halo
    paletted_frames = []
    
    # We create an adaptive palette based on the non-transparent pixels of all frames
    for i, frame in enumerate(frames):
        # Create a copy
        f_rgba = frame.copy()
        
        # Split channels
        r, g, b, a = f_rgba.split()
        
        # Pixels with alpha < 40 are fully transparent
        # Make transparent index 255
        # Convert to P mode using quantize with transparency
        # Use an RGB version with black background, but record the mask
        mask = Image.eval(a, lambda a_val: 0 if a_val < 45 else 255)
        
        # Convert image to RGB
        rgb_img = Image.new("RGB", f_rgba.size, (0, 0, 0))
        rgb_img.paste(f_rgba, mask=a)
        
        # Quantize to 255 colors (leaving index 255 for transparency)
        p_frame = rgb_img.quantize(colors=254, method=Image.Resampling.LANCZOS)
        
        # Now set transparent pixels to index 255
        p_data = list(p_frame.getdata())
        mask_data = list(mask.getdata())
        
        for idx in range(len(p_data)):
            if mask_data[idx] == 0:
                p_data[idx] = 255
                
        p_frame.putdata(p_data)
        
        # Set palette with index 255 as black or transparent
        palette = p_frame.getpalette()
        # Ensure palette is 768 elements (256 * 3)
        while len(palette) < 768:
            palette.append(0)
        p_frame.putpalette(palette)
        
        p_frame.info['transparency'] = 255
        p_frame.info['duration'] = duration
        p_frame.info['disposal'] = 2
        paletted_frames.append(p_frame)

    paletted_frames[0].save(
        out_path,
        save_all=True,
        append_images=paletted_frames[1:],
        duration=duration,
        loop=0,
        transparency=255,
        disposal=2,
        optimize=False
    )
    print(f"Saved transparent GIF to {out_path} ({len(paletted_frames)} frames)")

if __name__ == "__main__":
    frames = create_hindu_swastika()
    # Save static png preview (frame 0)
    frames[0].save("assets/swastika.png")
    # Save animated GIF
    save_transparent_gif(frames, "assets/swastika.gif")
    
    # Also save to artifact directory
    art_dir = r"C:\Users\abhis\.gemini\antigravity-ide\brain\0163dbbd-0afe-4e0f-b112-0c124e4aa945"
    if os.path.exists(art_dir):
        frames[0].save(os.path.join(art_dir, "swastika.png"))
        save_transparent_gif(frames, os.path.join(art_dir, "swastika.gif"))
