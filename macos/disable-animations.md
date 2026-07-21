# Disable macOS Animations

Copy the whole block and paste it into Terminal.

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

# --- Dock ----------------------------------------------------------------
# Dock hide/show animation
defaults write com.apple.dock autohide-time-modifier -float 0
# Delay before the Dock appears on hover
defaults write com.apple.dock autohide-delay -float 0
# Mission Control transitions
defaults write com.apple.dock expose-animation-duration -float 0
# Launchpad show / hide / page flip
defaults write com.apple.dock springboard-show-duration -float 0
defaults write com.apple.dock springboard-hide-duration -float 0
defaults write com.apple.dock springboard-page-duration -float 0

# --- Finder --------------------------------------------------------------
defaults write com.apple.finder DisableAllAnimations -bool true

# --- Apply ---------------------------------------------------------------
# Dock and Finder read these on restart.
# Global (-g) settings apply per app on its next launch - log out for full effect.
killall Dock
killall Finder
```

The first line is required: `zsh` does not allow `#` comments in an interactive
session by default, so pasting the block without it makes every comment line fail
with `command not found: #`.

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

# Dock
defaults delete com.apple.dock autohide-time-modifier
defaults delete com.apple.dock autohide-delay
defaults delete com.apple.dock expose-animation-duration
defaults delete com.apple.dock springboard-show-duration
defaults delete com.apple.dock springboard-hide-duration
defaults delete com.apple.dock springboard-page-duration

# Finder
defaults delete com.apple.finder DisableAllAnimations

killall Dock
killall Finder
```

## Note on Mail

The old `com.apple.Mail DisableSendAnimations` / `DisableReplyAnimations` keys are
left out: Mail is sandboxed, so `defaults write` fails with
`Could not write domain ...` unless the terminal has Full Disk Access, and current
Mail versions ignore the keys anyway.

## Source

https://apple.stackexchange.com/questions/14001/how-to-turn-off-all-animations-on-os-x/142734#142734
