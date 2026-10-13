import { Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import AdminProductFormPage from './AdminProductForm'

// Nested routes rendered inside the authorized branch of the /admin/* gate.
// Paths are relative to /admin, so "products/new" resolves to /admin/products/new.
export default function AdminRoutes({ user, onSignOut }) {
  return (
    <Routes>
      <Route index element={<AdminDashboard user={user} onSignOut={onSignOut} />} />
      <Route path="products/new" element={<AdminProductFormPage mode="create" />} />
      <Route path="products/:id/edit" element={<AdminProductFormPage mode="edit" />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}
