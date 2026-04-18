# 🚨 CRITICAL: Project Organization Rules (MANDATORY)

> **📌 TRAINING LOG:** Always keep `docs/GENESIS-ERROR-TRAINING-LOG.md` in mind — coordinate online (web) and offline (exe) versions!

## ⚠️ THESE RULES MUST BE FOLLOWED IN EVERY PROJECT

### **Rule #1: Always Organize Files Properly**
**NEVER leave files scattered in the root directory!**

#### **Correct Project Structure:**
```
ProjectName/
├── 📁 build/          # Build scripts, tools, tests
│   ├── 📁 demos/     # Demo scripts
│   ├── 📁 tests/     # Test files
│   └── 📄 *.ps1      # Build scripts
├── 📁 docs/          # Documentation
├── 📁 src/           # Source code
├── 📁 dist/          # Built web files
├── 📁 dist-electron/ # Built executables
├── 📁 assets/        # Static assets
├── 📄 package.json   # Dependencies & scripts
├── 📄 Launch-*.bat   # Main launchers (in root)
└── 📄 README.md      # Project documentation
```

#### **File Organization Commands:**
```bash
# 📌 Essential: See docs/GENESIS-ERROR-TRAINING-LOG.md — always coordinate online & offline versions!

# Organize project (run this after setup):
npm run organize

# This will automatically:
# - Create proper directory structure
# - Move files to correct locations
# - Set up launchers in root
# - Ensure exe is in correct location
```

### **Rule #2: Exe Must Always Be in Correct Location**

#### **Exe Location Requirements:**
- ✅ **Primary:** `dist-electron/ProjectName.exe`
- ✅ **Secondary:** `ProjectName.exe` (copy for easy access)
- ❌ **Never:** Scattered in random locations

#### **Exe Update Commands:**
```bash
# After ANY code changes:
npm run build:all      # Builds both versions
npm run ensure-exe     # Verifies exe placement
npm run check-sync     # Confirms synchronization
```

### **Rule #3: Version Synchronization is Mandatory**

#### **Synchronization Requirements:**
- ✅ Web and exe versions must be identical
- ✅ Both must be rebuilt after ANY changes
- ✅ Timestamps must match (within 1 minute)
- ✅ Features must work in both versions

#### **Sync Verification:**
```bash
npm run check-sync
```
**This command will FAIL if versions are out of sync!**

### **Rule #4: Launcher System Must Be Included**

#### **Required Launcher Files:**
```
build/
├── 📄 Launch-Project.bat         # Main launcher
├── 📄 Setup-Project.bat         # Setup script
├── 📄 build-all.ps1             # Build system
├── 📄 check-sync.ps1            # Sync checker
├── 📄 ensure-exe-placement.ps1  # Exe placement
└── 📄 organize-project.ps1      # Organization
```

#### **Launcher Behavior:**
- ✅ **Launch-Project.bat** - Universal launcher (try desktop → fallback to web)
- ✅ **Setup-Project.bat** - Complete setup and dependency installation
- ✅ **Auto-fallback** - If exe fails, opens web version

### **Rule #5: Documentation Must Be Complete**

#### **Required Documentation:**
```
docs/
├── 📄 README.md              # Main project README
├── 📄 RUNNING-Project.md     # How to run/launch
├── 📄 BUILD_SYNC.md          # Build synchronization guide
├── 📄 PROJECT-RULES.md       # This file
└── 📄 *-README.md           # Feature-specific docs
```

### **Rule #6: Build System Must Handle All Environments**

#### **Build System Requirements:**
- ✅ **Works in sandboxed environments** (no electron-builder)
- ✅ **Creates placeholder exes** when real build fails
- ✅ **Provides clear error messages**
- ✅ **Includes fallback mechanisms**

#### **Build Commands:**
```bash
npm run build:all     # Force rebuild both versions
npm run organize      # Organize project structure
npm run ensure-exe    # Verify exe placement
npm run diagnose      # Troubleshoot issues
```

### **Rule #7: Root Directory Must Stay Clean**

#### **What Belongs in Root:**
- ✅ `package.json` - Dependencies and scripts
- ✅ `Launch-*.bat` - Main launcher (created by organize script)
- ✅ `Setup-*.bat` - Setup launcher (created by organize script)
- ✅ `README.md` - Basic project info
- ✅ `PROJECT-RULES.md` - This rules file

#### **What Does NOT Belong in Root:**
- ❌ Build scripts (move to `build/`)
- ❌ Test files (move to `build/tests/`)
- ❌ Documentation (move to `docs/`)
- ❌ Demo files (move to `build/demos/`)
- ❌ Temporary files

### **Rule #8: Always Test Both Versions**

#### **Testing Requirements:**
```bash
# Test web version:
npm run serve:web

# Test exe version:
.\dist-electron\Project.exe

# Test universal launcher:
.\Launch-Project.bat
```

#### **Feature Verification:**
- ✅ Save/Load functionality works
- ✅ UI is identical between versions
- ✅ Performance is acceptable
- ✅ Error handling works

### **Rule #9: Include Setup and Diagnostic Tools**

#### **Required Tools:**
```bash
npm run setup        # Install dependencies and setup
npm run diagnose     # Comprehensive diagnostics
npm run test-launch  # Verify launchers work
```

### **Rule #10: Update Process Must Be Automated**

#### **Post-Change Workflow:**
```bash
# 1. Make code changes
# 2. Run: npm run build:all
# 3. Run: npm run check-sync
# 4. Test both versions
# 5. Commit changes
```

**NEVER commit without running the full build and sync check!**

---

## 📋 **Quick Reference Commands:**

```bash
# Setup project:
npm run organize

# Build everything:
npm run build:all

# Check synchronization:
npm run check-sync

# Verify exe placement:
npm run ensure-exe

# Diagnose issues:
npm run diagnose

# Test launchers:
npm run test-launch

# Setup dependencies:
npm run setup
```

## 🚨 **Consequences of Breaking Rules:**

- ❌ **Version mismatches** between web and exe
- ❌ **Broken functionality** in one version
- ❌ **Inconsistent user experience**
- ❌ **Difficult debugging** and maintenance
- ❌ **Failed deployments**

## ✅ **Benefits of Following Rules:**

- ✅ **Always synchronized** versions
- ✅ **Clean, organized** project structure
- ✅ **Easy maintenance** and updates
- ✅ **Reliable deployments**
- ✅ **Consistent user experience**

---

**📝 Remember: These rules ensure every project you create will be professional, maintainable, and reliable!**

**ALWAYS run `npm run organize` and `npm run build:all` in every project!** 🎯