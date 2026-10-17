import { Route, Routes } from 'react-router-dom'
import { ScrollToTop, NotFound } from './components/common/PageStates.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './components/common/RouteGuards.jsx'
import { DashboardLayout } from './components/layout/DashboardLayout.jsx'
import { PublicLayout } from './components/layout/PublicLayout.jsx'

import Home from './pages/public/Home.jsx'
import PropertiesPage from './pages/public/Properties.jsx'
import PropertyDetail from './pages/public/PropertyDetail.jsx'
import Services from './pages/public/Services.jsx'
import ServiceDetail from './pages/public/ServiceDetail.jsx'
import About from './pages/public/About.jsx'
import Blog from './pages/public/Blog.jsx'
import BlogPost from './pages/public/BlogPost.jsx'
import Careers from './pages/public/Careers.jsx'
import Contact from './pages/public/Contact.jsx'
import NewsletterLink from './pages/public/NewsletterLink.jsx'
import Login from './pages/auth/Login.jsx'
import Register from './pages/auth/Register.jsx'
import ProfilePage from './pages/account/ProfilePage.jsx'
import PasswordPage from './pages/account/PasswordPage.jsx'

import Dashboard from './pages/manage/Dashboard.jsx'
import Reports from './pages/manage/Reports.jsx'
import ManageProperties from './pages/manage/Properties.jsx'
import PropertyForm from './pages/manage/PropertyForm.jsx'
import Users from './pages/manage/Users.jsx'
import Leases from './pages/manage/Leases.jsx'
import LeaseForm from './pages/manage/LeaseForm.jsx'
import Invoices from './pages/manage/Invoices.jsx'
import InvoiceDetail from './pages/manage/InvoiceDetail.jsx'
import Payments from './pages/manage/Payments.jsx'
import Receipts from './pages/manage/Receipts.jsx'
import Enquiries from './pages/manage/Enquiries.jsx'
import Messages from './pages/shared/Messages.jsx'
import ManagePosts from './pages/manage/ManagePosts.jsx'
import PostForm from './pages/manage/PostForm.jsx'
import ManageCategories from './pages/manage/ManageCategories.jsx'
import CompanySettings from './pages/manage/CompanySettings.jsx'
import EmailCampaigns from './pages/manage/EmailCampaigns.jsx'
import EmailSubscribers from './pages/manage/EmailSubscribers.jsx'

import TenantDashboard from './pages/portal/Dashboard.jsx'
import TenantLeases from './pages/portal/Leases.jsx'
import TenantStatement from './pages/portal/Statement.jsx'

const MANAGE_ROLES = ['ADMIN', 'LANDLORD']

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="properties/:slug" element={<PropertyDetail />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:slug" element={<ServiceDetail />} />
          <Route path="about" element={<About />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:slug" element={<BlogPost />} />
          <Route path="careers" element={<Careers />} />
          <Route path="contact" element={<Contact />} />
          <Route path="newsletter/confirm" element={<NewsletterLink kind="confirm" />} />
          <Route path="newsletter/unsubscribe" element={<NewsletterLink kind="unsubscribe" />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Staff area: ADMIN and LANDLORD. Django decides what each row is. */}
        <Route element={<ProtectedRoute roles={MANAGE_ROLES} />}>
          <Route element={<DashboardLayout />}>
            <Route path="manage" element={<Dashboard />} />
            <Route path="manage/reports" element={<Reports />} />
            <Route path="manage/properties" element={<ManageProperties />} />
            <Route path="manage/properties/new" element={<PropertyForm />} />
            <Route path="manage/properties/:id/edit" element={<PropertyForm />} />
            <Route path="manage/leases" element={<Leases />} />
            <Route path="manage/leases/new" element={<LeaseForm />} />
            <Route path="manage/leases/:id/edit" element={<LeaseForm />} />
            <Route path="manage/invoices" element={<Invoices />} />
            <Route path="manage/invoices/:id" element={<InvoiceDetail />} />
            <Route path="manage/payments" element={<Payments />} />
            <Route path="manage/receipts" element={<Receipts />} />
            <Route path="manage/messages" element={<Messages />} />
            <Route path="manage/profile" element={<ProfilePage />} />
            <Route path="manage/password" element={<PasswordPage />} />

            <Route element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route path="manage/users" element={<Users />} />
              <Route path="manage/enquiries" element={<Enquiries />} />
              <Route path="manage/posts" element={<ManagePosts />} />
              <Route path="manage/posts/new" element={<PostForm />} />
              <Route path="manage/posts/:id/edit" element={<PostForm />} />
              <Route path="manage/categories" element={<ManageCategories />} />
              <Route path="manage/email/campaigns" element={<EmailCampaigns />} />
              <Route path="manage/email/subscribers" element={<EmailSubscribers />} />
              <Route path="manage/company" element={<CompanySettings />} />
            </Route>
          </Route>
        </Route>

        {/* Tenant portal */}
        <Route element={<ProtectedRoute roles={['TENANT']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="portal" element={<TenantDashboard />} />
            <Route path="portal/leases" element={<TenantLeases />} />
            <Route path="portal/statement" element={<TenantStatement />} />
            <Route path="portal/invoices" element={<Invoices portal />} />
            <Route path="portal/invoices/:id" element={<InvoiceDetail portal />} />
            <Route path="portal/payments" element={<Payments portal />} />
            <Route path="portal/receipts" element={<Receipts portal />} />
            <Route path="portal/messages" element={<Messages />} />
            <Route path="portal/profile" element={<ProfilePage />} />
            <Route path="portal/password" element={<PasswordPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}
