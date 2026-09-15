# Disable macOS Animations

Checked on macOS 27.0. Copy the whole block and paste it into Terminal.

```bash
setopt interactive_comments 2>/dev/null

# --- Global (NSGlobalDomain) ---------------------------------------------
# Window open/close animations
defaults write -g NSAutomaticWindowAnimationsEnabled -bool false
# Smooth scrolling
defaults write -g NSScrollAnimationEnabled -bool false
# Elastic bounce at the end of a scroll
defaults write -g NSScrollViewRubberbanding -bool false
# Window resize speed (0.001 = instant)
defaults write -g NSWindowResizeTime -float 0.001
# Quick Look panel open/close
defaults write -g QLPanelAnimationDuration -float 0
# Time Machine / Versions browser zoom effect
defaults write -g NSDocumentRevisionsWindowTransformAnimation -bool false
# Toolbar slide when entering full screen
defaults write -g NSToolbarFullScreenAnimationDuration -float 0
# Finder column view sliding
defaults write -g NSBrowserColumnAnimationSpeedMultiplier -float 0
# Animated focus ring around text fields
defaults write -g NSUseAnimatedFocusRing -bool false
# Delay before the toolbar title reacts on hover
defaults write -g NSToolbarTitleViewRolloverDelay -float 0

# --- Dock ----------------------------------------------------------------
# Dock hide/show animation
defaults write com.apple.dock autohide-time-modifier -float 0
# Delay before the Dock appears on hover
defaults write com.apple.dock autohide-delay -float 0
# Mission Control transitions
defaults write com.apple.dock expose-animation-duration -float 0
# Launchpad show / hide / page flip (Launchpad is gone since macOS 26 - likely no effect)
defaults write com.apple.dock springboard-show-duration -float 0
defaults write com.apple.dock springboard-hide-duration -float 0
defaults write com.apple.dock springboard-page-duration -float 0
# Bouncing icons while an app launches
defaults write com.apple.dock launchanim -bool false
# Minimize with a plain scale instead of the genie effect
defaults write com.apple.dock mineffect -string scale
# Icon magnification on hover
defaults write com.apple.dock magnification -bool false
# Space slide when activating an app that lives on another Space
defaults write com.apple.dock workspaces-swoosh-animation-off -bool true

# --- Finder --------------------------------------------------------------
defaults write com.apple.finder DisableAllAnimations -bool true

# --- Window Manager ------------------------------------------------------
# Clicking the wallpaper sweeps all windows aside to show the desktop
defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -bool false

# --- Apply ---------------------------------------------------------------
# Dock, Finder and WindowManager read these on restart.
# Global (-g) settings apply per app on its next launch - log out for full effect.
killall Dock
killall Finder
killall WindowManager
```

The first line is required: `zsh` does not allow `#` comments in an interactive
session by default, so pasting the block without it makes every comment line fail
with `command not found: #`.

## Manual: Accessibility

These two can't be set from Terminal: `com.apple.universalaccess` is protected, so
`defaults write` fails with `Could not write domain com.apple.universalaccess`.
Turn them on in System Settings (or type the name into the Settings search field):

- **Accessibility → Motion → Reduce motion** - on macOS 26+ it moved out of the
  Display page. Switching Spaces (`Ctrl ←` / `Ctrl →`) becomes a short crossfade
  instead of a slide. There is no `defaults` key that removes that transition
  entirely; only third-party window managers (e.g. `yabai` with SIP partially
  disabled) can make it instant.
- **Accessibility → Display → Reduce transparency** - removes blur and translucent
  (Liquid Glass) panels.

## Revert

```bash
setopt interactive_comments 2>/dev/null

# Global
defaults delete -g NSAutomaticWindowAnimationsEnabled
defaults delete -g NSScrollAnimationEnabled
defaults delete -g NSScrollViewRubberbanding
defaults delete -g NSWindowResizeTime
defaults delete -g QLPanelAnimationDuration
defaults delete -g NSDocumentRevisionsWindowTransformAnimation
defaults delete -g NSToolbarFullScreenAnimationDuration
defaults delete -g NSBrowserColumnAnimationSpeedMultiplier
defaults delete -g NSUseAnimatedFocusRing
defaults delete -g NSToolbarTitleViewRolloverDelay

# Dock
defaults delete com.apple.dock autohide-time-modifier
defaults delete com.apple.dock autohide-delay
defaults delete com.apple.dock expose-animation-duration
defaults delete com.apple.dock springboard-show-duration
defaults delete com.apple.dock springboard-hide-duration
defaults delete com.apple.dock springboard-page-duration
defaults delete com.apple.dock launchanim
defaults delete com.apple.dock mineffect
defaults delete com.apple.dock magnification
defaults delete com.apple.dock workspaces-swoosh-animation-off

# Finder
defaults delete com.apple.finder DisableAllAnimations

# Window Manager
defaults delete com.apple.WindowManager EnableStandardClickToShowDesktop

killall Dock
killall Finder
killall WindowManager
```

Then switch **Reduce motion** and **Reduce transparency** back off by hand.

## Note on Mail

The old `com.apple.Mail DisableSendAnimations` / `DisableReplyAnimations` keys are
left out: Mail is sandboxed, so `defaults write` fails with
`Could not write domain ...` unless the terminal has Full Disk Access, and current
Mail versions ignore the keys anyway.

## Source

https://apple.stackexchange.com/questions/14001/how-to-turn-off-all-animations-on-os-x/142734#142734
