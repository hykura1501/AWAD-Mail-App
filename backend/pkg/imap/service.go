package imap

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/smtp"
	"strings"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/emersion/go-message/mail"
)

type IMAPService struct{}

func NewService() *IMAPService {
	return &IMAPService{}
}

// Helper to connect
func (s *IMAPService) connect(server string, port int, email, password string) (*client.Client, error) {
	return ConnectAndLogin(server, port, email, password)
}

func (s *IMAPService) GetMailboxes(ctx context.Context, server string, port int, email, password string) ([]*emaildomain.Mailbox, error) {
	c, err := s.connect(server, port, email, password)
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	mailboxes := make(chan *imap.MailboxInfo, 10)
	done := make(chan error, 1)
	go func() {
		done <- c.List("", "*", mailboxes)
	}()

	var result []*emaildomain.Mailbox
	for m := range mailboxes {
		// Skip [Gmail] root folder or folders that cannot be selected
		isNoSelect := false
		for _, attr := range m.Attributes {
			if attr == "\\Noselect" {
				isNoSelect = true
				break
			}
		}
		if isNoSelect || m.Name == "[Gmail]" {
			continue
		}

		// Map IMAP attributes to our domain
		id := m.Name
		name := m.Name
		type_ := "user" // Default to user folder

		// Check attributes for standard folders (RFC 6154)
		for _, attr := range m.Attributes {
			switch attr {
			case "\\Sent":
				type_ = "sent"
				id = "SENT"
			case "\\Trash":
				type_ = "trash"
				id = "TRASH"
			case "\\Drafts":
				type_ = "drafts"
				id = "DRAFT"
			case "\\Junk":
				type_ = "spam"
				id = "SPAM"
			case "\\Flagged", "\\Starred": // Some servers use \Starred
				type_ = "starred"
				id = "STARRED"
			case "\\Important":
				type_ = "important"
				id = "IMPORTANT"
			case "\\All":
				type_ = "all"
				id = "ALL"
			}
		}

		// Fallback to name matching if attributes are missing (common in some servers)
		if type_ == "user" {
			lowerName := strings.ToLower(name)
			if lowerName == "inbox" {
				type_ = "inbox"
				id = "INBOX"
			} else if strings.Contains(lowerName, "sent") || strings.Contains(lowerName, "thư đã gửi") {
				type_ = "sent"
				id = "SENT"
			} else if strings.Contains(lowerName, "trash") || strings.Contains(lowerName, "bin") || strings.Contains(lowerName, "thùng rác") {
				type_ = "trash"
				id = "TRASH"
			} else if strings.Contains(lowerName, "draft") || strings.Contains(lowerName, "thư nháp") {
				type_ = "drafts"
				id = "DRAFT"
			} else if strings.Contains(lowerName, "spam") || strings.Contains(lowerName, "junk") || strings.Contains(lowerName, "thư rác") {
				type_ = "spam"
				id = "SPAM"
			} else if strings.Contains(lowerName, "starred") || strings.Contains(lowerName, "có gắn dấu sao") {
				type_ = "starred"
				id = "STARRED"
			} else if strings.Contains(lowerName, "important") || strings.Contains(lowerName, "quan trọng") {
				type_ = "important"
				id = "IMPORTANT"
			}
		}
		
		// If ID was normalized to a standard ID, we still need the original name to Select the mailbox later.
		// But wait, if we change the ID returned to frontend, the frontend will send back "SENT".
		// We need to map "SENT" back to "[Gmail]/Sent Mail" (or whatever the real name is) when fetching emails.
		// This requires state or a lookup. Since we don't have persistent state for mailbox mapping,
		// we can't easily do this without querying the list again or encoding the real name in the ID.
		
		// Alternative: Use the real name as ID, but ensure it's URL safe?
		// The user wants the structure to match Google OAuth.
		// Google OAuth returns ID="SENT", Name="SENT".
		// If we return ID="SENT", we MUST be able to fetch emails using ID="SENT".
		
		// Solution: When fetching emails, if the ID is a standard one (SENT, TRASH, etc.), 
		// we need to find the corresponding real mailbox name.
		// We can do this by listing mailboxes again and finding the one with the matching attribute/name.
		// This adds overhead but ensures correctness and compatibility.
		
		// For now, let's keep the ID as the real name for non-standard folders, 
		// but for standard ones, we might need a way to handle the mapping.
		
		// Actually, simpler approach for MVP:
		// Return the real name as ID, but set the TYPE correctly.
		// The frontend likely uses the TYPE to display icons/names.
		// The user's complaint is about the ID structure too?
		// "Với Outh2 ... id: SENT ... Với imap ... id: [Gmail]/Thư đã gửi"
		// The frontend probably relies on ID="SENT" to filter or route.
		
		// Let's try to map standard IDs.
		// We will need to handle the reverse mapping in GetEmails.

		// Get mailbox status (Unread count)
		var count int
		status, err := c.Status(m.Name, []imap.StatusItem{imap.StatusUnseen})
		if err == nil {
			count = int(status.Unseen)
		}
		
		result = append(result, &emaildomain.Mailbox{
			ID:    id, // Normalized ID if standard, else real name
			Name:  name,
			Type:  type_,
			Count: count,
		})
	}

	if err := <-done; err != nil {
		return nil, err
	}
	return result, nil
}

func (s *IMAPService) resolveMailboxName(c *client.Client, mailboxID string) (string, error) {
	// If mailboxID is a standard ID, we need to find the real name
	// If it's not one of our standard IDs, assume it's the real name
	
	standardIDs := map[string]bool{
		"INBOX": true, "SENT": true, "TRASH": true, "DRAFT": true, "SPAM": true, "STARRED": true, "IMPORTANT": true, "ALL": true,
	}
	
	if !standardIDs[mailboxID] {
		return mailboxID, nil
	}
	
	if mailboxID == "INBOX" {
		return "INBOX", nil
	}

	// List all mailboxes to find the match
	mailboxes := make(chan *imap.MailboxInfo, 10)
	done := make(chan error, 1)
	go func() {
		done <- c.List("", "*", mailboxes)
	}()

	var realName string
	found := false

	for m := range mailboxes {
		// Check attributes first
		for _, attr := range m.Attributes {
			switch attr {
			case "\\Sent":
				if mailboxID == "SENT" { realName = m.Name; found = true }
			case "\\Trash":
				if mailboxID == "TRASH" { realName = m.Name; found = true }
			case "\\Drafts":
				if mailboxID == "DRAFT" { realName = m.Name; found = true }
			case "\\Junk":
				if mailboxID == "SPAM" { realName = m.Name; found = true }
			case "\\Flagged":
				if mailboxID == "STARRED" { realName = m.Name; found = true }
			case "\\Important":
				if mailboxID == "IMPORTANT" { realName = m.Name; found = true }
			case "\\All":
				if mailboxID == "ALL" { realName = m.Name; found = true }
			}
		}
		
		if found {
			continue // Drain channel
		}

		// Fallback to name matching
		lowerName := strings.ToLower(m.Name)
		if mailboxID == "SENT" && (strings.Contains(lowerName, "sent") || strings.Contains(lowerName, "thư đã gửi")) {
			realName = m.Name; found = true
		} else if mailboxID == "TRASH" && (strings.Contains(lowerName, "trash") || strings.Contains(lowerName, "bin") || strings.Contains(lowerName, "thùng rác")) {
			realName = m.Name; found = true
		} else if mailboxID == "DRAFT" && (strings.Contains(lowerName, "draft") || strings.Contains(lowerName, "thư nháp")) {
			realName = m.Name; found = true
		} else if mailboxID == "SPAM" && (strings.Contains(lowerName, "spam") || strings.Contains(lowerName, "junk") || strings.Contains(lowerName, "thư rác")) {
			realName = m.Name; found = true
		} else if mailboxID == "STARRED" && (strings.Contains(lowerName, "starred") || strings.Contains(lowerName, "có gắn dấu sao")) {
			realName = m.Name; found = true
		} else if mailboxID == "IMPORTANT" && (strings.Contains(lowerName, "important") || strings.Contains(lowerName, "quan trọng")) {
			realName = m.Name; found = true
		}
	}

	if err := <-done; err != nil {
		return "", err
	}

	if found {
		return realName, nil
	}
	
	// If not found, maybe the ID is the name itself (fallback)
	return mailboxID, nil
}

func (s *IMAPService) parseBody(r io.Reader) (string, string, bool) {
	mr, err := mail.CreateReader(r)
	if err != nil {
		return "", "", false
	}

	var htmlBody, textBody string

	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}

		switch h := p.Header.(type) {
		case *mail.InlineHeader:
			ct, _, _ := h.ContentType()
			b, _ := io.ReadAll(p.Body)
			if ct == "text/html" {
				htmlBody = string(b)
			} else if ct == "text/plain" {
				textBody = string(b)
			}
		}
	}

	if htmlBody != "" {
		return htmlBody, textBody, true
	}
	return textBody, textBody, false
}

func (s *IMAPService) GetEmails(ctx context.Context, server string, port int, emailAddr, password, mailboxID string, limit, offset int) ([]*emaildomain.Email, int, error) {
	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return nil, 0, err
	}
	defer c.Logout()

	// Resolve real mailbox name from ID
	realMailboxName, err := s.resolveMailboxName(c, mailboxID)
	if err != nil {
		return nil, 0, err
	}

	mbox, err := c.Select(realMailboxName, true)
	if err != nil {
		return nil, 0, err
	}

	if mbox.Messages == 0 {
		return []*emaildomain.Email{}, 0, nil
	}

	// Calculate range
	from := uint32(1)
	to := mbox.Messages
	if mbox.Messages > uint32(offset) {
		to = mbox.Messages - uint32(offset)
	} else {
		return []*emaildomain.Email{}, int(mbox.Messages), nil
	}
	
	if to > uint32(limit) {
		from = to - uint32(limit) + 1
	} else {
		from = 1
	}

	seqset := new(imap.SeqSet)
	seqset.AddRange(from, to)

	messages := make(chan *imap.Message, limit)
	done := make(chan error, 1)
	
	section := &imap.BodySectionName{Peek: true}
	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchFlags, imap.FetchInternalDate, imap.FetchUid, section.FetchItem()}

	go func() {
		done <- c.Fetch(seqset, items, messages)
	}()

	var result []*emaildomain.Email
	for msg := range messages {
		// Parse email
		subject := msg.Envelope.Subject
		from := ""
		if len(msg.Envelope.From) > 0 {
			from = fmt.Sprintf("%s <%s@%s>", msg.Envelope.From[0].PersonalName, msg.Envelope.From[0].MailboxName, msg.Envelope.From[0].HostName)
		}
		
		to := []string{}
		for _, addr := range msg.Envelope.To {
			to = append(to, fmt.Sprintf("%s <%s@%s>", addr.PersonalName, addr.MailboxName, addr.HostName))
		}
		
		body := ""
		snippet := ""
		isHTML := false
		
		r := msg.GetBody(section)
		if r != nil {
			var textBody string
			body, textBody, isHTML = s.parseBody(r)
			if len(textBody) > 100 {
				snippet = textBody[:100] + "..."
			} else {
				snippet = textBody
			}
		}

		isRead := false
		isStarred := false
		for _, f := range msg.Flags {
			if f == imap.SeenFlag {
				isRead = true
			}
			if f == imap.FlaggedFlag {
				isStarred = true
			}
		}

		result = append(result, &emaildomain.Email{
			ID:         base64.URLEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%d", realMailboxName, msg.Uid))), // Encode Mailbox:UID
			Subject:    subject,
			From:       from,
			To:         to,
			Preview:    snippet,
			Body:       body,
			IsHTML:     isHTML,
			ReceivedAt: msg.Envelope.Date,
			IsRead:     isRead,
			IsStarred:  isStarred,
			MailboxID:  mailboxID,
		})
	}

	// Reverse result to show newest first
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result, int(mbox.Messages), <-done
}

func (s *IMAPService) GetEmailByID(ctx context.Context, server string, port int, emailAddr, password, messageID string) (*emaildomain.Email, error) {
	// Decode ID to get Mailbox and UID
	decodedBytes, err := base64.URLEncoding.DecodeString(messageID)
	if err != nil {
		return nil, fmt.Errorf("invalid email ID format")
	}
	decoded := string(decodedBytes)
	parts := strings.Split(decoded, ":")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid email ID format")
	}
	mailboxName := parts[0]
	uidStr := parts[1]
	
	var uid uint32
	_, err = fmt.Sscanf(uidStr, "%d", &uid)
	if err != nil {
		return nil, fmt.Errorf("invalid UID format")
	}

	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return nil, err
	}
	defer c.Logout()

	_, err = c.Select(mailboxName, false)
	if err != nil {
		return nil, err
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	messages := make(chan *imap.Message, 1)
	done := make(chan error, 1)
	
	section := &imap.BodySectionName{}
	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchFlags, imap.FetchInternalDate, imap.FetchUid, section.FetchItem()}

	go func() {
		done <- c.UidFetch(seqset, items, messages)
	}()

	msg := <-messages
	if msg == nil {
		return nil, fmt.Errorf("email not found")
	}

	if err := <-done; err != nil {
		return nil, err
	}

	// Parse email details
	subject := msg.Envelope.Subject
	from := ""
	if len(msg.Envelope.From) > 0 {
		from = fmt.Sprintf("%s <%s@%s>", msg.Envelope.From[0].PersonalName, msg.Envelope.From[0].MailboxName, msg.Envelope.From[0].HostName)
	}
	
	to := []string{}
	for _, addr := range msg.Envelope.To {
		to = append(to, fmt.Sprintf("%s <%s@%s>", addr.PersonalName, addr.MailboxName, addr.HostName))
	}
	
	// Get Body
	r := msg.GetBody(section)
	body := ""
	isHTML := false
	snippet := ""
	
	if r != nil {
		var textBody string
		body, textBody, isHTML = s.parseBody(r)
		if len(textBody) > 100 {
			snippet = textBody[:100] + "..."
		} else {
			snippet = textBody
		}
	}

	isRead := false
	isStarred := false
	for _, f := range msg.Flags {
		if f == imap.SeenFlag {
			isRead = true
		}
		if f == imap.FlaggedFlag {
			isStarred = true
		}
	}

	return &emaildomain.Email{
		ID:         messageID,
		Subject:    subject,
		From:       from,
		To:         to,
		Body:       body,
		Preview:    snippet,
		IsHTML:     isHTML,
		ReceivedAt: msg.Envelope.Date,
		IsRead:     isRead,
		IsStarred:  isStarred,
		MailboxID:  mailboxName, // Or map back to standard ID if needed
	}, nil
}

func (s *IMAPService) SendEmail(ctx context.Context, server string, port int, emailAddr, password string, to, subject, body string) error {
	// Need SMTP server. Usually imap.gmail.com -> smtp.gmail.com
	// We need to infer SMTP settings or ask user.
	// For Gmail: smtp.gmail.com:587
	
	smtpServer := "smtp.gmail.com"
	smtpPort := "587"
	
	// Simple heuristic for common providers
	if strings.Contains(server, "outlook") {
		smtpServer = "smtp.office365.com"
		smtpPort = "587"
	}
	
	auth := smtp.PlainAuth("", emailAddr, password, smtpServer)
	
	msg := []byte(fmt.Sprintf("To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/html; charset=\"UTF-8\"\r\n"+
		"\r\n"+
		"%s\r\n", to, subject, body))
		
	addr := fmt.Sprintf("%s:%s", smtpServer, smtpPort)
	return smtp.SendMail(addr, auth, emailAddr, []string{to}, msg)
}

func (s *IMAPService) modifyFlags(ctx context.Context, server string, port int, emailAddr, password, messageID string, flags []interface{}, add bool) error {
	// Decode ID
	decodedBytes, err := base64.URLEncoding.DecodeString(messageID)
	if err != nil {
		return fmt.Errorf("invalid email ID format")
	}
	decoded := string(decodedBytes)
	parts := strings.Split(decoded, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid email ID format")
	}
	mailboxName := parts[0]
	uidStr := parts[1]
	
	var uid uint32
	_, err = fmt.Sscanf(uidStr, "%d", &uid)
	if err != nil {
		return fmt.Errorf("invalid UID format")
	}

	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return err
	}
	defer c.Logout()

	_, err = c.Select(mailboxName, false)
	if err != nil {
		return err
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	item := imap.FormatFlagsOp(imap.AddFlags, true)
	if !add {
		item = imap.FormatFlagsOp(imap.RemoveFlags, true)
	}

	return c.UidStore(seqset, item, flags, nil)
}

func (s *IMAPService) MarkAsRead(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	return s.modifyFlags(ctx, server, port, emailAddr, password, messageID, []interface{}{imap.SeenFlag}, true)
}

func (s *IMAPService) MarkAsUnread(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	return s.modifyFlags(ctx, server, port, emailAddr, password, messageID, []interface{}{imap.SeenFlag}, false)
}

func (s *IMAPService) ToggleStar(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	// Need to check current state first to toggle
	// Decode ID
	decodedBytes, err := base64.URLEncoding.DecodeString(messageID)
	if err != nil {
		return fmt.Errorf("invalid email ID format")
	}
	decoded := string(decodedBytes)
	parts := strings.Split(decoded, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid email ID format")
	}
	mailboxName := parts[0]
	uidStr := parts[1]
	
	var uid uint32
	_, err = fmt.Sscanf(uidStr, "%d", &uid)
	if err != nil {
		return fmt.Errorf("invalid UID format")
	}

	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return err
	}
	defer c.Logout()

	_, err = c.Select(mailboxName, false)
	if err != nil {
		return err
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	// Fetch current flags
	messages := make(chan *imap.Message, 1)
	done := make(chan error, 1)
	go func() {
		done <- c.UidFetch(seqset, []imap.FetchItem{imap.FetchFlags}, messages)
	}()

	msg := <-messages
	if msg == nil {
		return fmt.Errorf("email not found")
	}
	if err := <-done; err != nil {
		return err
	}

	isStarred := false
	for _, f := range msg.Flags {
		if f == imap.FlaggedFlag {
			isStarred = true
			break
		}
	}

	item := imap.FormatFlagsOp(imap.AddFlags, true)
	if isStarred {
		item = imap.FormatFlagsOp(imap.RemoveFlags, true)
	}

	return c.UidStore(seqset, item, []interface{}{imap.FlaggedFlag}, nil)
}

func (s *IMAPService) moveEmail(ctx context.Context, server string, port int, emailAddr, password, messageID string, targetMailboxType string) error {
	// Decode ID
	decodedBytes, err := base64.URLEncoding.DecodeString(messageID)
	if err != nil {
		return fmt.Errorf("invalid email ID format")
	}
	decoded := string(decodedBytes)
	parts := strings.Split(decoded, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid email ID format")
	}
	mailboxName := parts[0]
	uidStr := parts[1]
	
	var uid uint32
	_, err = fmt.Sscanf(uidStr, "%d", &uid)
	if err != nil {
		return fmt.Errorf("invalid UID format")
	}

	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return err
	}
	defer c.Logout()

	// Find target mailbox name
	mailboxes := make(chan *imap.MailboxInfo, 10)
	done := make(chan error, 1)
	go func() {
		done <- c.List("", "*", mailboxes)
	}()

	var targetMailboxName string
	found := false

	for m := range mailboxes {
		for _, attr := range m.Attributes {
			if (targetMailboxType == "trash" && attr == "\\Trash") ||
			   (targetMailboxType == "archive" && attr == "\\All") { // Archive usually means All Mail in Gmail
				targetMailboxName = m.Name
				found = true
				break
			}
		}
		if found { continue } // Drain
		
		// Fallback name matching
		lowerName := strings.ToLower(m.Name)
		if targetMailboxType == "trash" && (strings.Contains(lowerName, "trash") || strings.Contains(lowerName, "bin") || strings.Contains(lowerName, "thùng rác")) {
			targetMailboxName = m.Name; found = true
		} else if targetMailboxType == "archive" && (strings.Contains(lowerName, "all mail") || strings.Contains(lowerName, "tất cả thư")) {
			targetMailboxName = m.Name; found = true
		}
	}
	
	if err := <-done; err != nil {
		return err
	}

	if !found {
		// Fallback defaults
		if targetMailboxType == "trash" {
			targetMailboxName = "[Gmail]/Trash"
		} else {
			targetMailboxName = "[Gmail]/All Mail"
		}
	}

	_, err = c.Select(mailboxName, false)
	if err != nil {
		return err
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	// Copy to target
	err = c.UidCopy(seqset, targetMailboxName)
	if err != nil {
		return err
	}

	// Mark as deleted in source
	item := imap.FormatFlagsOp(imap.AddFlags, true)
	err = c.UidStore(seqset, item, []interface{}{imap.DeletedFlag}, nil)
	if err != nil {
		return err
	}

	// Expunge (optional, but good to clean up)
	// c.Expunge(nil) // Be careful with Expunge as it affects all deleted messages
	
	return nil
}

func (s *IMAPService) TrashEmail(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	return s.moveEmail(ctx, server, port, emailAddr, password, messageID, "trash")
}

func (s *IMAPService) ArchiveEmail(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	return s.moveEmail(ctx, server, port, emailAddr, password, messageID, "archive")
}

// PermanentDeleteEmail permanently deletes an email by marking as deleted and expunging
func (s *IMAPService) PermanentDeleteEmail(ctx context.Context, server string, port int, emailAddr, password, messageID string) error {
	// Decode ID
	decodedBytes, err := base64.URLEncoding.DecodeString(messageID)
	if err != nil {
		return fmt.Errorf("invalid email ID format")
	}
	decoded := string(decodedBytes)
	parts := strings.Split(decoded, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid email ID format")
	}
	mailboxName := parts[0]
	uidStr := parts[1]
	
	var uid uint32
	_, err = fmt.Sscanf(uidStr, "%d", &uid)
	if err != nil {
		return fmt.Errorf("invalid UID format")
	}

	c, err := s.connect(server, port, emailAddr, password)
	if err != nil {
		return err
	}
	defer c.Logout()

	_, err = c.Select(mailboxName, false)
	if err != nil {
		return err
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	// Mark as deleted
	item := imap.FormatFlagsOp(imap.AddFlags, true)
	err = c.UidStore(seqset, item, []interface{}{imap.DeletedFlag}, nil)
	if err != nil {
		return err
	}

	// Expunge to permanently delete
	return c.Expunge(nil)
}
