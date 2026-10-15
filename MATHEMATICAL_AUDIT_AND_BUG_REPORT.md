# Mathematical Audit and Bug Report: AeroFlow 2D Fluid Simulation

## Executive Summary

This report provides a rigorous mathematical audit of the **AeroFlow 2D** WebGL2 Navier-Stokes fluid simulation engine. The evaluation covers the governing partial differential equations (PDEs), discretization schemes, boundary conditions, numerical stability criteria, and potential edge-case bugs identified across the codebase.

---

## 1. Governing Equations & Mathematical Framework

The fluid simulation solves the Navier-Stokes equations for viscous, incompressible (and weakly compressible) Newtonian fluids in 2D Eulerian coordinates:

### A. Momentum Conservation (Navier-Stokes)
$$\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla)\mathbf{u} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{u} + \mathbf{f}$$

Where:
- $\mathbf{u} = (u, v)$ is the velocity vector field.
- $\rho$ is fluid density (assumed constant $\rho = 1$ in the incompressible solver).
- $p$ is pressure.
- $\nu$ is kinematic viscosity (`CONFIG.viscosity`).
- $\mathbf{f}$ represents external body forces (e.g., buoyancy, mouse splats, vorticity confinement).

### B. Mass Conservation (Incompressibility)
$$\nabla \cdot \mathbf{u} = \frac{\partial u}{\partial x} + \frac{\partial v}{\partial y} = 0$$

### C. Pressure Poisson Equation (PPE)
Derived by taking the divergence of the momentum equation after advection and diffusion:
$$\nabla^2 p = \frac{\rho}{\Delta t} (\nabla \cdot \mathbf{u}^*)$$
Where $\mathbf{u}^*$ is the intermediate predicted velocity field prior to projection.

---

## 2. Numerical Discretization & Solvers

### A. Advection (Semi-Lagrangian Method)
- **Implementation:** Backward characteristic tracking (`advectFS` in `shaders.js`):
  $$\mathbf{x}_{back} = \mathbf{x} - \mathbf{u}(\mathbf{x}, t) \Delta t$$
- **Mathematical Properties:** Unconditionally stable for any time step $\Delta t$ (Eulerian backtracking), but introduces numerical dissipation (smoothing of sharp gradients) due to bilinear texture interpolation.
- **Audit Findings:** Energy conservation is not strictly enforced during long-running advection steps, leading to gradual kinetic energy dissipation.

### B. Pressure Projection (Hodge-Decomposition / Helmholtz-Hodge Theorem)
- **Divergence Calculation (`divergenceFS`):**
  $$\nabla \cdot \mathbf{u} \approx \frac{1}{2\Delta x} \left( u_{i+1,j} - u_{i-1,j} + v_{i,j+1} - v_{i,j-1} \right)$$
- **Poisson Solver (`pressureFS` - Jacobi Iteration):**
  $$p^{(k+1)}_{i,j} = \frac{p_{i-1,j}^{(k)} + p_{i+1,j}^{(k)} + p_{i,j-1}^{(k)} + p_{i,j+1}^{(k)} - (\nabla \cdot \mathbf{u})_{i,j}}{4}$$
- **Audit Findings:** Jacobi iteration has slow convergence rates ($\mathcal{O}(N^2)$ iterations for convergence on $N \times N$ grids). With fixed low iteration counts (`CONFIG.pressureIterations`), pressure fields do not fully converge, leaving residual divergence ($\nabla \cdot \mathbf{u} \neq 0$), which manifests as artificial compressibility or slight volume drift near obstacles.

### C. Viscous Diffusion (`diffuseFS` - Implicit Jacobi Scheme)
- **Discretization:**
  $$\left(I - \nu \Delta t \nabla^2\right) \mathbf{u}^{n+1} = \mathbf{u}^*$$
- **Audit Findings:** The implicit formulation ensures unconditional stability for large viscosities. However, boundary treatment at solid obstacles uses simple Dirichlet/Neumann clamping, which can cause spurious velocity gradients near obstacle perimeters.

---

## 3. Boundary Conditions & Obstacle Interaction

### A. Solid Obstacles (Immersed Boundary Method)
- Obstacles are rasterized into an `RGBA8` texture (`obstacleTex`), where:
  - Red channel ($R > 0.5$): Solid interior mask.
  - Green/Blue channels encode boundary velocity vectors ($v_x, v_y$).
- **Audit Findings:** 
  - **Velocity Boundary Condition:** Enforced via conditional checks in fragment shaders (`if (obs.r > 0.5) fragColor = obstacleVelocity;`). While effective at preventing fluid penetration, zero-velocity boundary conditions create standard numerical slip-stick artifacts without sub-pixel distance weighting (e.g., standard stair-stepping approximation on curved obstacle boundaries).
  - **Pressure Boundary Condition:** Neumann boundary condition ($\frac{\partial p}{\partial n} = 0$) at solid walls is approximated by setting pressure divergence to zero inside obstacles.

### B. Inflow and Outflow Boundaries
- **Inflow (`progInflow`):** Dirichlet boundary condition on the left domain edge injecting uniform velocity and dye streamlines.
- **Outflow (`progDivergence`):** Right edge utilizes an open outlet condition (`bool rightEdge = vUV.x >= 1.0 - d.x;` setting $L = R$).
- **Audit Findings:** While the right-edge outlet condition prevents artificial pressure reflection, severe vortices exiting the domain can occasionally produce backflow instabilities if velocity gradients exceed grid resolution limits.

---

## 4. Stability Analysis & CFL Condition

### A. Courant-Friedrichs-Lewy (CFL) Condition
For explicit advection and force integration steps, stability requires:
$$\text{CFL} = \max(|\mathbf{u}|) \frac{\Delta t}{\Delta x} \le 1.0$$
- **Audit Findings:** In high-speed wind tunnel modes or large mouse-splat impulses, velocity magnitudes can violate the CFL condition ($\text{CFL} > 1.0$), resulting in grid tearing, checkerboard patterns, or NaN propagation in floating-point textures (`EXT_color_buffer_float`).
- **Mitigation Recommendation:** Implement dynamic sub-stepping or automatic $\Delta t$ clamping based on maximum velocity magnitude across the domain.

---

## 5. Bug Report & Identified Vulnerabilities

| ID | Severity | Component | Description | Recommended Fix |
|:---|:---:|:---|:---|:---|
| **BUG-01** | 🟠 HIGH | Shader Precision / NaN | High-velocity divergence spikes or division by zero in vorticity confinement can yield `NaN` values in floating-point FBOs (`EXT_color_buffer_float`), causing the canvas to freeze/turn black. | Add `isnan()` / `isinf()` checks or robust epsilon clamping (`max(..., 1e-5)`) in advection and vorticity shaders. |
| **BUG-02** | 🟡 MEDIUM | Pressure Convergence | Fixed iteration counts for pressure Poisson solver (`CONFIG.pressureIterations`) lead to incomplete divergence elimination at high grid resolutions ($512 \times 512+$). | Implement adaptive residual termination or switch to Red-Black Gauss-Seidel / Multigrid solver. |
| **BUG-03** | 🟡 MEDIUM | Boundary Stair-stepping | Rasterized obstacles suffer from pixel aliasing (stair-steps), causing artificial drag and flow separation anomalies around smooth curves. | Use signed distance fields (SDF) or sub-pixel fractional area/volume obstacle representation (FAVR). |
| **BUG-04** | ⚪ LOW | Energy Dissipation | Semi-Lagrangian backtracking numerical diffusion artificially dampens kinetic energy over time without external energy injection. | Incorporate higher-order interpolation (e.g., cubic B-spline filtering) or anti-dissipative vorticity corrections. |

---

## 6. Conclusion

AeroFlow 2D correctly implements the core Eulerian incompressible Navier-Stokes solver using stable Semi-Lagrangian advection and projection methods. Addressing **BUG-01** (NaN propagation safeguards) and **BUG-02/03** (pressure convergence and boundary aliasing) will significantly enhance simulation fidelity under extreme Mach numbers and complex obstacle geometries.
