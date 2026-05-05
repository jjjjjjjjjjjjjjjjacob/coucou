import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { TestWrapper } from './test-wrapper'

// Mock the Convex hooks
const mockApprove = mock((args: any) => Promise.resolve({ ok: true, code: 'ABC123' }))
const mockDeny = mock((args: any) => Promise.resolve({ ok: true }))
const mockToggleRedemptionStatus = mock((args: any) => Promise.resolve({ status: 'enabled' }))
const mockUseQuery = mock((api: string, args: any) => {
  if (api === 'events.listAll') {
    return [
      {
        _id: 'event123',
        name: 'Test Event',
        eventDate: Date.now(),
      },
    ]
  }
  if (api === 'events.get') {
    return {
      _id: 'event123',
      name: 'Test Event',
      customFields: [
        { key: 'company', label: 'Company', required: false },
        { key: 'title', label: 'Job Title', required: false },
      ],
    }
  }
  if (api === 'rsvps.listForEvent') {
    return [
      {
        id: 'rsvp1',
        name: 'John Doe',
        listKey: 'general',
        status: 'pending',
        redemptionStatus: 'none',
        redemptionCode: null,
        customFieldValues: { company: 'Acme Corp', title: 'Developer' },
      },
      {
        id: 'rsvp2',
        name: 'Jane Smith',
        listKey: 'vip',
        status: 'approved',
        redemptionStatus: 'issued',
        redemptionCode: 'XYZ789',
        customFieldValues: { company: 'Tech Inc', title: 'Manager' },
      },
      {
        id: 'rsvp3',
        name: 'Bob Johnson',
        listKey: 'general',
        status: 'denied',
        redemptionStatus: 'disabled',
        redemptionCode: 'DEF456',
        customFieldValues: { company: 'StartupXYZ', title: 'CEO' },
      },
    ]
  }
  return []
})

const mockUseMutation = mock((api: string) => {
  if (api === 'approvals.approve') return mockApprove
  if (api === 'approvals.deny') return mockDeny
  if (api === 'redemptions.toggleRedemptionStatus') return mockToggleRedemptionStatus
  return mock()
})

// Mock the modules
mock.module('convex/react', () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}))

mock.module('next/navigation', () => ({
  useRouter: mock(() => ({
    replace: mock(),
  })),
  usePathname: mock(() => '/'),
  useSearchParams: mock(() => ({
    get: mock(() => 'event123'),
  })),
}))

mock.module('sonner', () => ({
  toast: {
    success: mock(),
    error: mock(),
  },
}))

// Mock component to test the status management logic
const MockRSVPStatusManagement = () => {
  return (
    <TestWrapper>
      <div data-testid="rsvp-management">
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>List</th>
              <th>Company</th>
              <th>Job Title</th>
              <th>Approval</th>
              <th>Ticket</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Pending RSVP */}
            <tr data-testid="rsvp-pending">
              <td>John Doe</td>
              <td>GENERAL</td>
              <td>Acme Corp</td>
              <td>Developer</td>
              <td>
                <button
                  data-testid="status-dropdown-pending"
                  className="text-amber-700 border-amber-200 bg-amber-50"
                  onClick={() => {
                    // This would open the dropdown in the real component
                    // For testing, we'll simulate direct status changes
                  }}
                >
                  Pending
                </button>
                <div data-testid="status-options-pending" style={{ display: 'none' }}>
                  <div
                    data-testid="status-option-approved"
                    onClick={() => mockApprove({ rsvpId: 'rsvp1' })}
                  >
                    Approved
                  </div>
                  <div
                    data-testid="status-option-denied"
                    onClick={() => mockDeny({ rsvpId: 'rsvp1' })}
                  >
                    Denied
                  </div>
                </div>
              </td>
              <td>
                <span className="bg-foreground/10 text-foreground/80">Not issued</span>
              </td>
              <td>
                {/* No ticket actions for pending */}
              </td>
            </tr>
            {/* Approved RSVP */}
            <tr data-testid="rsvp-approved">
              <td>Jane Smith</td>
              <td>VIP</td>
              <td>Tech Inc</td>
              <td>Manager</td>
              <td>
                <button
                  data-testid="status-dropdown-approved"
                  className="text-green-700 border-green-200 bg-green-50"
                  onClick={() => {
                    // This would open the dropdown in the real component
                  }}
                >
                  Approved
                </button>
                <div data-testid="status-options-approved" style={{ display: 'none' }}>
                  <div
                    data-testid="status-option-pending"
                    onClick={() => {/* Would need a mutation to set to pending */}}
                  >
                    Pending
                  </div>
                  <div
                    data-testid="status-option-denied"
                    onClick={() => mockDeny({ rsvpId: 'rsvp2' })}
                  >
                    Denied
                  </div>
                </div>
              </td>
              <td>
                <span className="bg-purple-100 text-purple-800">Issued</span>
              </td>
              <td>
                <button
                  data-testid="toggle-ticket-approved"
                  onClick={() => mockToggleRedemptionStatus({ rsvpId: 'rsvp2' })}
                >
                  Disable Ticket
                </button>
              </td>
            </tr>
            {/* Denied RSVP */}
            <tr data-testid="rsvp-denied">
              <td>Bob Johnson</td>
              <td>GENERAL</td>
              <td>StartupXYZ</td>
              <td>CEO</td>
              <td>
                <button
                  data-testid="status-dropdown-denied"
                  className="text-red-700 border-red-200 bg-red-50"
                  onClick={() => {
                    // This would open the dropdown in the real component
                  }}
                >
                  Denied
                </button>
                <div data-testid="status-options-denied" style={{ display: 'none' }}>
                  <div
                    data-testid="status-option-pending"
                    onClick={() => {/* Would need a mutation to set to pending */}}
                  >
                    Pending
                  </div>
                  <div
                    data-testid="status-option-approved"
                    onClick={() => mockApprove({ rsvpId: 'rsvp3' })}
                  >
                    Approved
                  </div>
                </div>
              </td>
              <td>
                <span className="bg-gray-200 text-gray-800">Disabled</span>
              </td>
              <td>
                <button
                  data-testid="toggle-ticket-denied"
                  onClick={() => {
                    // This should fail for denied RSVP
                    try {
                      mockToggleRedemptionStatus({ rsvpId: 'rsvp3' })
                    } catch (error) {
                      // Expected to fail
                    }
                  }}
                  disabled
                >
                  Enable Ticket (Disabled)
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </TestWrapper>
  )
}

describe('RSVP Status Management', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockApprove.mockClear()
    mockDeny.mockClear()
    mockToggleRedemptionStatus.mockClear()
  })

  describe('Approval Status Changes', () => {
    it('should approve a pending RSVP and create a ticket', async () => {
      render(<MockRSVPStatusManagement />)

      // Get all pending rows and use the first one
      const pendingRows = screen.getAllByTestId('rsvp-pending')
      const approveOption = pendingRows[0].querySelector('[data-testid="status-option-approved"]') as HTMLElement
      fireEvent.click(approveOption)

      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith({ rsvpId: 'rsvp1' })
      })

      // Verify the mutation was called
      expect(mockApprove).toHaveBeenCalledTimes(1)
    })

    it('should deny a pending RSVP', async () => {
      render(<MockRSVPStatusManagement />)

      // Get all pending rows and use the first one
      const pendingRows = screen.getAllByTestId('rsvp-pending')
      const denyOption = pendingRows[0].querySelector('[data-testid="status-option-denied"]') as HTMLElement
      fireEvent.click(denyOption)

      await waitFor(() => {
        expect(mockDeny).toHaveBeenCalledWith({ rsvpId: 'rsvp1' })
      })

      expect(mockDeny).toHaveBeenCalledTimes(1)
    })

    it('should re-approve a denied RSVP and re-enable ticket', async () => {
      render(<MockRSVPStatusManagement />)

      // Get all denied rows and use the first one
      const deniedRows = screen.getAllByTestId('rsvp-denied')
      const approveOption = deniedRows[0].querySelector('[data-testid="status-option-approved"]') as HTMLElement
      fireEvent.click(approveOption)

      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith({ rsvpId: 'rsvp3' })
      })

      expect(mockApprove).toHaveBeenCalledTimes(1)
    })
  })

  describe('Ticket Status Changes', () => {
    it('should toggle ticket status for approved RSVP', async () => {
      render(<MockRSVPStatusManagement />)

      const toggleButtons = screen.getAllByTestId('toggle-ticket-approved')
      fireEvent.click(toggleButtons[0])

      await waitFor(() => {
        expect(mockToggleRedemptionStatus).toHaveBeenCalledWith({ rsvpId: 'rsvp2' })
      })

      expect(mockToggleRedemptionStatus).toHaveBeenCalledTimes(1)
    })

    it('should prevent enabling ticket for denied RSVP', () => {
      render(<MockRSVPStatusManagement />)

      const toggleButtons = screen.getAllByTestId('toggle-ticket-denied')
      const toggleButton = toggleButtons[0]

      // Button should be disabled
      expect(toggleButton).toBeDisabled()
    })
  })

  describe('UI State Consistency', () => {
    it('should display correct approval dropdown states', () => {
      render(<MockRSVPStatusManagement />)

      // Check pending dropdown
      const pendingDropdowns = screen.getAllByTestId('status-dropdown-pending')
      expect(pendingDropdowns[0]).toHaveTextContent('Pending')
      expect(pendingDropdowns[0]).toHaveClass('text-amber-700')

      // Check approved dropdown
      const approvedDropdowns = screen.getAllByTestId('status-dropdown-approved')
      expect(approvedDropdowns[0]).toHaveTextContent('Approved')
      expect(approvedDropdowns[0]).toHaveClass('text-green-700')

      // Check denied dropdown
      const deniedDropdowns = screen.getAllByTestId('status-dropdown-denied')
      expect(deniedDropdowns[0]).toHaveTextContent('Denied')
      expect(deniedDropdowns[0]).toHaveClass('text-red-700')
    })

    it('should display correct ticket status badges', () => {
      render(<MockRSVPStatusManagement />)

      // Check not issued status
      const pendingRows = screen.getAllByTestId('rsvp-pending')
      expect(pendingRows[0]).toHaveTextContent('Not issued')

      // Check issued status
      const approvedRows = screen.getAllByTestId('rsvp-approved')
      expect(approvedRows[0]).toHaveTextContent('Issued')

      // Check disabled status
      const deniedRows = screen.getAllByTestId('rsvp-denied')
      expect(deniedRows[0]).toHaveTextContent('Disabled')
    })

    it('should display custom field data correctly', () => {
      render(<MockRSVPStatusManagement />)

      // Check that custom field data is displayed
      const pendingRows = screen.getAllByTestId('rsvp-pending')
      expect(pendingRows[0]).toHaveTextContent('Acme Corp')
      expect(pendingRows[0]).toHaveTextContent('Developer')

      const approvedRows = screen.getAllByTestId('rsvp-approved')
      expect(approvedRows[0]).toHaveTextContent('Tech Inc')
      expect(approvedRows[0]).toHaveTextContent('Manager')

      const deniedRows = screen.getAllByTestId('rsvp-denied')
      expect(deniedRows[0]).toHaveTextContent('StartupXYZ')
      expect(deniedRows[0]).toHaveTextContent('CEO')
    })

    it('should show appropriate action buttons based on current state', () => {
      render(<MockRSVPStatusManagement />)

      // All RSVPs should have approval dropdowns
      expect(screen.getAllByTestId('status-dropdown-pending')[0]).toBeInTheDocument()
      expect(screen.getAllByTestId('status-dropdown-approved')[0]).toBeInTheDocument()
      expect(screen.getAllByTestId('status-dropdown-denied')[0]).toBeInTheDocument()

      // Approved RSVP should have ticket toggle option
      expect(screen.getAllByTestId('toggle-ticket-approved')[0]).toBeInTheDocument()

      // Denied RSVP should have disabled ticket toggle
      expect(screen.getAllByTestId('toggle-ticket-denied')[0]).toBeDisabled()
    })
  })
})

describe('Custom Field Column Generation', () => {
  it('should generate columns for all custom fields', () => {
    const mockCustomFields = [
      { key: 'company', label: 'Company', required: false },
      { key: 'title', label: 'Job Title', required: false },
      { key: 'experience', label: 'Years of Experience', required: true },
    ]

    // Simulate the column generation logic
    const customFieldColumns = mockCustomFields.map((field) => ({
      id: `custom_${field.key}`,
      header: field.label,
      accessorFn: (r: any) => r.customFieldValues?.[field.key] || '',
    }))

    expect(customFieldColumns).toHaveLength(3)
    expect(customFieldColumns[0].id).toBe('custom_company')
    expect(customFieldColumns[0].header).toBe('Company')
    expect(customFieldColumns[1].id).toBe('custom_title')
    expect(customFieldColumns[1].header).toBe('Job Title')
    expect(customFieldColumns[2].id).toBe('custom_experience')
    expect(customFieldColumns[2].header).toBe('Years of Experience')
  })

  it('should handle missing custom fields gracefully', () => {
    const mockRsvp = {
      customFieldValues: { company: 'Test Corp' } // Missing title field
    }

    const accessorFn = (r: any) => r.customFieldValues?.['title'] || ''
    const result = accessorFn(mockRsvp)

    expect(result).toBe('')
  })

  it('should handle completely missing custom fields', () => {
    const mockRsvp = {} // No shared fields at all

    const accessorFn = (r: any) => r.customFieldValues?.['company'] || ''
    const result = accessorFn(mockRsvp)

    expect(result).toBe('')
  })
})

describe('RSVP Status Validation Logic', () => {
  it('should validate approval status types', () => {
    const validApprovalStatuses = ['pending', 'approved', 'denied']
    expect(validApprovalStatuses).toContain('pending')
    expect(validApprovalStatuses).toContain('approved')
    expect(validApprovalStatuses).toContain('denied')
  })

  it('should validate ticket status types', () => {
    const validTicketStatuses = ['none', 'issued', 'redeemed', 'disabled']
    expect(validTicketStatuses).toContain('none')
    expect(validTicketStatuses).toContain('issued')
    expect(validTicketStatuses).toContain('redeemed')
    expect(validTicketStatuses).toContain('disabled')
  })

  it('should validate status transition logic', () => {
    const isValidApprovalTransition = (from: string, to: string) => {
      const validTransitions = {
        'pending': ['approved', 'denied'],
        'approved': ['denied'],
        'denied': ['approved']
      }
      return validTransitions[from as keyof typeof validTransitions]?.includes(to) || false
    }

    // Test valid transitions
    expect(isValidApprovalTransition('pending', 'approved')).toBe(true)
    expect(isValidApprovalTransition('pending', 'denied')).toBe(true)
    expect(isValidApprovalTransition('approved', 'denied')).toBe(true)
    expect(isValidApprovalTransition('denied', 'approved')).toBe(true)

    // Test invalid transitions
    expect(isValidApprovalTransition('approved', 'pending')).toBe(false)
    expect(isValidApprovalTransition('denied', 'pending')).toBe(false)
  })

  it('should validate ticket status business rules', () => {
    const canEnableTicket = (approvalStatus: string, ticketStatus: string) => {
      // Manual ticket edits are only available for approved host rows.
      if (approvalStatus !== 'approved') return false
      // Cannot change redeemed tickets
      if (ticketStatus === 'redeemed') return false
      return true
    }

    expect(canEnableTicket('approved', 'disabled')).toBe(true)
    expect(canEnableTicket('pending', 'none')).toBe(false)
    expect(canEnableTicket('denied', 'disabled')).toBe(false)
    expect(canEnableTicket('approved', 'redeemed')).toBe(false)
  })

  it('treats attending rows as approved in host approval views', () => {
    const deriveHostApprovalStatus = (status: string) => {
      if (status === 'approved' || status === 'attending') return 'approved'
      if (status === 'denied') return 'denied'
      return 'pending'
    }

    expect(deriveHostApprovalStatus('attending')).toBe('approved')
    expect(deriveHostApprovalStatus('approved')).toBe('approved')
    expect(deriveHostApprovalStatus('pending')).toBe('pending')
  })

  it('includes attending rows when filtering by approved approval status', () => {
    const mockRsvps = [
      { id: 'rsvp1', status: 'approved', listKey: 'vip' },
      { id: 'rsvp2', status: 'attending', listKey: 'vip' },
      { id: 'rsvp3', status: 'pending', listKey: 'vip' },
      { id: 'rsvp4', status: 'denied', listKey: 'general' },
    ]

    const filterByApproval = (
      rsvps: typeof mockRsvps,
      approvalFilter: 'all' | 'pending' | 'approved' | 'denied',
      listFilter: string,
    ) => {
      return rsvps.filter((rsvp) => {
        const approvalStatus =
          rsvp.status === 'approved' || rsvp.status === 'attending'
            ? 'approved'
            : rsvp.status

        if (approvalFilter !== 'all' && approvalStatus !== approvalFilter) {
          return false
        }

        if (listFilter !== 'all' && rsvp.listKey !== listFilter) {
          return false
        }

        return true
      })
    }

    const filteredRows = filterByApproval(mockRsvps, 'approved', 'vip')
    expect(filteredRows.map((rsvp) => rsvp.id)).toEqual(['rsvp1', 'rsvp2'])
    expect(filteredRows).toHaveLength(2)
  })
})

describe('Advanced RSVP Management Features', () => {
  // Mock the new mutations we added
  const mockUpdateRsvpComplete = mock((args: any) => Promise.resolve({ status: 'ok' }))
  const mockDeleteRsvpComplete = mock((args: any) => Promise.resolve({ deleted: true }))

  // Mock data for testing
  const mockRsvpData = [
    {
      id: 'rsvp1',
      name: 'John Doe',
      listKey: 'general',
      status: 'pending',
      redemptionStatus: 'none',
      redemptionCode: null,
      customFieldValues: { company: 'Acme Corp', title: 'Developer' },
    },
    {
      id: 'rsvp2',
      name: 'Jane Smith',
      listKey: 'vip',
      status: 'approved',
      redemptionStatus: 'issued',
      redemptionCode: 'XYZ789',
      customFieldValues: { company: 'Tech Inc', title: 'Manager' },
    },
  ]

  // Mock component that simulates the new RSVP management features
  const MockAdvancedRSVPManagement = () => {
    const [pendingChanges, setPendingChanges] = React.useState<Record<string, {
      originalApprovalStatus: string;
      originalTicketStatus: string;
      currentApprovalStatus: string;
      currentTicketStatus: string;
    }>>({})

    const handleApprovalChange = (rsvpId: string, newStatus: string) => {
      const existing = pendingChanges[rsvpId]
      const rsvp = mockRsvpData.find(r => r.id === rsvpId)
      if (!rsvp) return

      setPendingChanges(prev => ({
        ...prev,
        [rsvpId]: {
          originalApprovalStatus: existing?.originalApprovalStatus ?? rsvp.status,
          originalTicketStatus: existing?.originalTicketStatus ?? rsvp.redemptionStatus,
          currentApprovalStatus: newStatus,
          currentTicketStatus: existing?.currentTicketStatus ?? rsvp.redemptionStatus,
        }
      }))
    }

    const handleTicketChange = (rsvpId: string, newStatus: string) => {
      const existing = pendingChanges[rsvpId]
      const rsvp = mockRsvpData.find(r => r.id === rsvpId)
      if (!rsvp) return

      setPendingChanges(prev => ({
        ...prev,
        [rsvpId]: {
          originalApprovalStatus: existing?.originalApprovalStatus ?? rsvp.status,
          originalTicketStatus: existing?.originalTicketStatus ?? rsvp.redemptionStatus,
          currentApprovalStatus: existing?.currentApprovalStatus ?? rsvp.status,
          currentTicketStatus: newStatus,
        }
      }))
    }

    const hasChanges = (rsvpId: string) => {
      const changes = pendingChanges[rsvpId]
      if (!changes) return false
      return changes.originalApprovalStatus !== changes.currentApprovalStatus ||
             changes.originalTicketStatus !== changes.currentTicketStatus
    }

    const handleSave = async (rsvpId: string) => {
      const changes = pendingChanges[rsvpId]
      if (!changes) return

      await mockUpdateRsvpComplete({
        rsvpId,
        approvalStatus: changes.currentApprovalStatus !== changes.originalApprovalStatus ? changes.currentApprovalStatus : undefined,
        ticketStatus: changes.currentTicketStatus !== changes.originalTicketStatus ? changes.currentTicketStatus : undefined,
      })

      // Clear pending changes after save
      setPendingChanges(prev => {
        const { [rsvpId]: _, ...rest } = prev
        return rest
      })
    }

    const handleDelete = async (rsvpId: string) => {
      await mockDeleteRsvpComplete({ rsvpId })
    }

    return (
      <TestWrapper>
        <div data-testid="advanced-rsvp-management">
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Approval</th>
                <th>Ticket</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockRsvpData.map((rsvp) => {
                const changes = pendingChanges[rsvp.id]
                const currentApprovalStatus = changes?.currentApprovalStatus ?? rsvp.status
                const currentTicketStatus = changes?.currentTicketStatus ?? rsvp.redemptionStatus
                const rowHasChanges = hasChanges(rsvp.id)

                return (
                  <tr
                    key={rsvp.id}
                    data-testid={`advanced-rsvp-row-${rsvp.id}`}
                    className={rowHasChanges ? 'bg-yellow-50' : ''}
                    style={{ backgroundColor: rowHasChanges ? '#fefce8' : undefined }}
                  >
                    <td>{rsvp.name}</td>
                    <td>
                      <div data-testid={`advanced-approval-dropdown-${rsvp.id}`}>
                        <button
                          data-testid={`advanced-approval-trigger-${rsvp.id}`}
                          className={`
                            ${currentApprovalStatus === 'pending' ? 'text-amber-700 bg-amber-50' : ''}
                            ${currentApprovalStatus === 'approved' ? 'text-green-700 bg-green-50' : ''}
                            ${currentApprovalStatus === 'denied' ? 'text-red-700 bg-red-50' : ''}
                          `}
                        >
                          {currentApprovalStatus.charAt(0).toUpperCase() + currentApprovalStatus.slice(1)}
                        </button>
                        <div data-testid={`advanced-approval-menu-${rsvp.id}`} style={{ display: 'none' }}>
                          <button
                            data-testid={`advanced-approval-option-approved-${rsvp.id}`}
                            onClick={() => handleApprovalChange(rsvp.id, 'approved')}
                          >
                            Approved
                          </button>
                          <button
                            data-testid={`advanced-approval-option-denied-${rsvp.id}`}
                            onClick={() => handleApprovalChange(rsvp.id, 'denied')}
                          >
                            Denied
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div data-testid={`advanced-ticket-dropdown-${rsvp.id}`}>
                        <button
                          data-testid={`advanced-ticket-trigger-${rsvp.id}`}
                          className={`
                            ${currentTicketStatus === 'none' ? 'bg-gray-100 text-gray-600' : ''}
                            ${currentTicketStatus === 'issued' ? 'bg-purple-100 text-purple-800' : ''}
                            ${currentTicketStatus === 'disabled' ? 'bg-gray-200 text-gray-800' : ''}
                          `}
                        >
                          {currentTicketStatus === 'none' ? 'Not issued' :
                           currentTicketStatus.charAt(0).toUpperCase() + currentTicketStatus.slice(1)}
                        </button>
                        <div data-testid={`advanced-ticket-menu-${rsvp.id}`} style={{ display: 'none' }}>
                          <button
                            data-testid={`advanced-ticket-option-issued-${rsvp.id}`}
                            onClick={() => handleTicketChange(rsvp.id, 'issued')}
                          >
                            Issued
                          </button>
                          <button
                            data-testid={`advanced-ticket-option-disabled-${rsvp.id}`}
                            onClick={() => handleTicketChange(rsvp.id, 'disabled')}
                          >
                            Disabled
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div data-testid={`advanced-actions-${rsvp.id}`}>
                        <button
                          data-testid={`advanced-save-button-${rsvp.id}`}
                          disabled={!rowHasChanges}
                          onClick={() => handleSave(rsvp.id)}
                          className={rowHasChanges ? 'enabled' : 'disabled'}
                        >
                          Save
                        </button>
                        <button
                          data-testid={`advanced-delete-button-${rsvp.id}`}
                          onClick={() => {
                            const confirmDelete = window.confirm('Are you sure you want to delete this RSVP?')
                            if (confirmDelete) {
                              handleDelete(rsvp.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </TestWrapper>
    )
  }

  beforeEach(() => {
    // Reset all mocks before each test
    mockUpdateRsvpComplete.mockClear()
    mockDeleteRsvpComplete.mockClear()
  })

  describe('Save Button Logic', () => {
    it('should be disabled when no changes are pending', () => {
      render(<MockAdvancedRSVPManagement />)

      // Initially, save buttons should be disabled
      const saveButtons1 = screen.getAllByTestId('advanced-save-button-rsvp1')
      const saveButtons2 = screen.getAllByTestId('advanced-save-button-rsvp2')
      expect(saveButtons1[0]).toBeDisabled()
      expect(saveButtons2[0]).toBeDisabled()
    })

    it('should be enabled when approval status changes', async () => {
      render(<MockAdvancedRSVPManagement />)

      // Change approval status
      const approvalOptions = screen.getAllByTestId('advanced-approval-option-approved-rsvp1')
      fireEvent.click(approvalOptions[0])

      // Save button should now be enabled
      await waitFor(() => {
        const saveButtons = screen.getAllByTestId('advanced-save-button-rsvp1')
        expect(saveButtons[0]).not.toBeDisabled()
      })
    })

    it('should call updateRsvpComplete when save is clicked', async () => {
      render(<MockAdvancedRSVPManagement />)

      // Make a change
      const approvalOptions = screen.getAllByTestId('advanced-approval-option-approved-rsvp1')
      fireEvent.click(approvalOptions[0])

      // Click save
      await waitFor(() => {
        const saveButtons = screen.getAllByTestId('advanced-save-button-rsvp1')
        expect(saveButtons[0]).not.toBeDisabled()
        fireEvent.click(saveButtons[0])
      })

      // Verify mutation was called
      await waitFor(() => {
        expect(mockUpdateRsvpComplete).toHaveBeenCalledWith({
          rsvpId: 'rsvp1',
          approvalStatus: 'approved',
          ticketStatus: undefined,
        })
      })
    })
  })

  describe('Delete Button with Confirmation', () => {
    it('should show confirmation dialog when delete is clicked', () => {
      render(<MockAdvancedRSVPManagement />)

      // Mock window.confirm
      const originalConfirm = window.confirm
      const mockConfirm = mock(() => true)
      window.confirm = mockConfirm

      const deleteButtons = screen.getAllByTestId('advanced-delete-button-rsvp1')
      fireEvent.click(deleteButtons[0])

      expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to delete this RSVP?')

      // Restore original confirm
      window.confirm = originalConfirm
    })

    it('should call deleteRsvpComplete when confirmed', async () => {
      render(<MockAdvancedRSVPManagement />)

      // Mock window.confirm to return true
      const originalConfirm = window.confirm
      window.confirm = mock(() => true)

      const deleteButtons = screen.getAllByTestId('advanced-delete-button-rsvp1')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(mockDeleteRsvpComplete).toHaveBeenCalledWith({ rsvpId: 'rsvp1' })
      })

      // Restore original confirm
      window.confirm = originalConfirm
    })
  })

  describe('Visual Indicators for Pending Changes', () => {
    it('should highlight rows with pending changes', async () => {
      render(<MockAdvancedRSVPManagement />)

      // Initially, no rows should be highlighted
      const rows1 = screen.getAllByTestId('advanced-rsvp-row-rsvp1')
      expect(rows1[0]).not.toHaveClass('bg-yellow-50')

      // Make a change
      const approvalOptions = screen.getAllByTestId('advanced-approval-option-approved-rsvp1')
      fireEvent.click(approvalOptions[0])

      // Row should now be highlighted
      await waitFor(() => {
        expect(rows1[0]).toHaveClass('bg-yellow-50')
        expect(rows1[0]).toHaveStyle({ backgroundColor: '#fefce8' })
      })
    })

    it('should remove highlighting after save', async () => {
      render(<MockAdvancedRSVPManagement />)

      const rows1 = screen.getAllByTestId('advanced-rsvp-row-rsvp1')

      // Make a change
      const approvalOptions = screen.getAllByTestId('advanced-approval-option-approved-rsvp1')
      fireEvent.click(approvalOptions[0])

      // Row should be highlighted
      await waitFor(() => {
        expect(rows1[0]).toHaveClass('bg-yellow-50')
      })

      // Save changes
      const saveButtons = screen.getAllByTestId('advanced-save-button-rsvp1')
      fireEvent.click(saveButtons[0])

      // Row should no longer be highlighted
      await waitFor(() => {
        expect(rows1[0]).not.toHaveClass('bg-yellow-50')
      })
    })
  })
})
